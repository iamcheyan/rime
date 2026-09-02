local M = {}

local ROOT_DIR = nil
local LOCAL_SYNC_FILE = nil
local latest_by_input = {}
local prefix_index = {}
local indexed_inputs = {}
local loaded = false

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

local function is_ascii_record(rec)
  if not rec or not rec.text or rec.text == "" then
    return false
  end
  if rec.type ~= "lower_ascii" and rec.type ~= "shift_ascii" then
    return false
  end
  return string.match(rec.text, "^[A-Za-z%-]+$") ~= nil
end

local function normalize_input(input)
  if not input or input == "" then
    return nil
  end
  if string.match(input, "^[A-Za-z%-]+$") == nil then
    return nil
  end
  return string.lower(input)
end

local function case_prefix_score(prefix, text)
  if string.sub(text, 1, string.len(prefix)) == prefix then
    return 1
  end
  return 0
end

local function index_input(input)
  if not input or input == "" or indexed_inputs[input] then
    return
  end
  indexed_inputs[input] = true
  local key = string.lower(string.sub(input, 1, 2))
  prefix_index[key] = prefix_index[key] or {}
  table.insert(prefix_index[key], input)
end

function M.load()
  if loaded then
    return
  end

  loaded = true
  latest_by_input = {}
  prefix_index = {}
  indexed_inputs = {}

  local fh = io.open(get_local_sync_file(), "r")
  if not fh then
    return
  end

  for line in fh:lines() do
    if line ~= "" and string.sub(line, 1, 1) ~= "#" then
      local fields = split_tsv(line)
      if #fields >= 4 then
        local rec = {
          input = fields[1] or "",
          type = fields[2] or "",
          text = fields[3] or "",
          updated_at = tonumber(fields[4]) or 0,
        }
        if is_ascii_record(rec) then
          local current = latest_by_input[rec.input]
          if current == nil or rec.updated_at >= current.updated_at then
            latest_by_input[rec.input] = rec
          end
        end
      end
    end
  end

  for input in pairs(latest_by_input) do
    index_input(input)
  end
  fh:close()
end

function M.record(rec)
  if not is_ascii_record(rec) then
    return
  end
  M.load()
  local current = latest_by_input[rec.input]
  if current == nil or (rec.updated_at or 0) >= (current.updated_at or 0) then
    latest_by_input[rec.input] = {
      input = rec.input,
      type = rec.type,
      text = rec.text,
      updated_at = rec.updated_at or os.time(),
    }
    index_input(rec.input)
  end
end

function M.query(input, limit)
  M.load()

  local normalized = normalize_input(input)
  if not normalized then
    return {}
  end

  local results = {}
  local seen = {}
  local requested = math.max(1, tonumber(limit) or 6)
  local bucket = prefix_index[string.lower(string.sub(normalized, 1, 2))] or {}

  for _, input_key in ipairs(bucket) do
    local rec = latest_by_input[input_key]
    if rec then
      local text_lower = string.lower(rec.text)
      if
        string.len(rec.text) > string.len(input) and
        string.sub(text_lower, 1, string.len(normalized)) == normalized and
        not seen[rec.text]
      then
        seen[rec.text] = true
        table.insert(results, {
          text = rec.text,
          updated_at = rec.updated_at or 0,
          case_score = case_prefix_score(input, rec.text),
        })
      end
    end
  end

  table.sort(results, function(a, b)
    if a.case_score ~= b.case_score then
      return a.case_score > b.case_score
    end
    if a.updated_at ~= b.updated_at then
      return a.updated_at > b.updated_at
    end
    if string.len(a.text) ~= string.len(b.text) then
      return string.len(a.text) < string.len(b.text)
    end
    return a.text < b.text
  end)

  local sliced = {}
  for i = 1, math.min(requested, #results) do
    sliced[i] = results[i]
  end
  return sliced
end

return M
