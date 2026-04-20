local SEP = "\31"
local DB_NAME = "dynamic_freq"
local CACHE_LIMIT = 256
local db_pool = db_pool or {}
local ROOT_DIR = nil
local LOCAL_SYNC_FILE = nil

local function dirname(path)
  return (path:gsub("[/\\][^/\\]+$", ""))
end

local function resolve_root_dir()
  if ROOT_DIR ~= nil then
    return ROOT_DIR
  end

  local source = debug.getinfo(1, "S").source or ""
  if string.sub(source, 1, 1) == "@" then
    source = string.sub(source, 2)
  end
  if source == "" then
    ROOT_DIR = "."
  else
    ROOT_DIR = dirname(dirname(source))
  end
  return ROOT_DIR
end

local function get_local_sync_file()
  if LOCAL_SYNC_FILE == nil then
    LOCAL_SYNC_FILE = resolve_root_dir() .. "/dynamic_freq.local.txt"
  end
  return LOCAL_SYNC_FILE
end

local function open_db(name)
  db_pool[name] = db_pool[name] or LevelDb(name)
  local db = db_pool[name]
  if db and not db:loaded() then
    db:open()
  end
  return db
end

local function pack(rec)
  return (rec.type or "") .. SEP .. (rec.text or "")
end

local function unpack_rec(raw)
  if not raw or raw == "" then
    return nil
  end
  local pos = string.find(raw, SEP, 1, true)
  if not pos then
    return { type = "", text = raw }
  end
  return {
    type = string.sub(raw, 1, pos - 1),
    text = string.sub(raw, pos + 1),
  }
end

local function passthrough(translation)
  for cand in translation:iter() do
    yield(cand)
  end
end

local function split_tsv(line)
  local fields = {}
  local start = 1
  while true do
    local pos = string.find(line, "\t", start, true)
    if not pos then
      table.insert(fields, string.sub(line, start))
      break
    end
    table.insert(fields, string.sub(line, start, pos - 1))
    start = pos + 1
  end
  return fields
end

local function load_local_sync_records()
  local path = get_local_sync_file()
  local fh = io.open(path, "r")
  if not fh then
    return {}
  end

  local latest = {}
  for line in fh:lines() do
    if line ~= "" and string.sub(line, 1, 1) ~= "#" then
      local fields = split_tsv(line)
      if #fields >= 4 then
        local input = fields[1]
        local rec = {
          input = input,
          type = fields[2] or "",
          text = fields[3] or "",
          updated_at = tonumber(fields[4]) or 0,
        }
        local current = latest[input]
        if current == nil or rec.updated_at >= current.updated_at then
          latest[input] = rec
        end
      end
    end
  end
  fh:close()
  return latest
end

local function append_local_sync_record(rec)
  local path = get_local_sync_file()
  local fh = io.open(path, "a")
  if not fh then
    return
  end
  fh:write(table.concat({
    rec.input or "",
    rec.type or "",
    rec.text or "",
    tostring(rec.updated_at or 0),
  }, "\t"))
  fh:write("\n")
  fh:close()
end

local function cache_put(env, key, value)
  if not key or key == "" then
    return
  end
  if env.cache[key] == nil then
    table.insert(env.cache_keys, key)
  end
  env.cache[key] = value
  while #env.cache_keys > CACHE_LIMIT do
    local oldest = table.remove(env.cache_keys, 1)
    if oldest ~= nil then
      env.cache[oldest] = nil
    end
  end
end

local function lookup_recent(env, input)
  if not input or input == "" or not env.db then
    return nil
  end
  if env.last_input == input then
    return env.last_rec
  end

  local rec = env.cache[input]
  if rec == nil then
    rec = unpack_rec(env.db:fetch(input)) or false
    cache_put(env, input, rec)
  end

  env.last_input = input
  env.last_rec = rec
  if rec == false then
    return nil
  end
  return rec
end

local function snapshot(ctx)
  if not ctx or not ctx:is_composing() then
    return nil
  end
  local input = ctx.input
  if not input or input == "" then
    return nil
  end
  local cand = ctx:get_selected_candidate()
  if not cand or not cand.text or cand.text == "" then
    return nil
  end
  return {
    input = input,
    type = cand.type or "",
    text = cand.text,
  }
end

local M = {}

function M.init(env)
  env.db = open_db(DB_NAME)
  env.pending = nil
  env.cache = {}
  env.cache_keys = {}
  env.last_input = nil
  env.last_rec = nil
  env.synced_records = load_local_sync_records()

  if env.db then
    for input, rec in pairs(env.synced_records) do
      if input ~= "" and rec.text and rec.text ~= "" then
        env.db:update(input, pack(rec))
      end
    end
  end

  env.select_conn = env.engine.context.select_notifier:connect(function(ctx)
    env.pending = snapshot(ctx)
  end)

  env.commit_conn = env.engine.context.commit_notifier:connect(function(ctx)
    local rec = snapshot(ctx) or env.pending
    env.pending = nil
    if not rec or not rec.input or rec.input == "" then
      return
    end

    local committed = ctx:get_commit_text()
    if committed and committed ~= "" and committed ~= rec.text then
      return
    end

    if env.db then
      env.db:update(rec.input, pack(rec))
    end
    rec.updated_at = os.time()
    env.synced_records[rec.input] = rec
    append_local_sync_record(rec)
    cache_put(env, rec.input, rec)
    env.last_input = rec.input
    env.last_rec = rec
  end)
end

function M.func(translation, env)
  local input = env.engine.context.input
  if not input or input == "" or not env.db then
    return passthrough(translation)
  end

  local rec = lookup_recent(env, input)
  if not rec or not rec.text or rec.text == "" then
    return passthrough(translation)
  end

  local buffered = {}
  local promoted = false

  for cand in translation:iter() do
    if not promoted and cand.text == rec.text and (rec.type == "" or cand.type == rec.type) then
      promoted = true
      yield(cand)
      for i = 1, #buffered do
        yield(buffered[i])
      end
      buffered = nil
    else
      if promoted then
        yield(cand)
      else
        table.insert(buffered, cand)
      end
    end
  end

  if not promoted then
    for i = 1, #buffered do
      yield(buffered[i])
    end
  end
end

function M.fini(env)
  if env.select_conn then
    env.select_conn:disconnect()
  end
  if env.commit_conn then
    env.commit_conn:disconnect()
  end
  env.pending = nil
  env.cache = nil
  env.cache_keys = nil
  env.last_input = nil
  env.last_rec = nil
  env.synced_records = nil
end

return M
