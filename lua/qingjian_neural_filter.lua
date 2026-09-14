-- Qingjian neural candidate filter.
-- Only nearby Rime quality groups are reordered, preserving user frequency.

local M = {}
local MAX_CANDIDATES = 32
local QUALITY_WINDOW = 25
local HELPER = nil

local function root_dir()
  local source = debug.getinfo(1, "S").source or ""
  if source:sub(1, 1) == "@" then source = source:sub(2) end
  return source:gsub("[/\\][^/\\]+$", ""):gsub("[/\\][^/\\]+$", "")
end

local function shell_quote(value)
  return "'" .. tostring(value):gsub("'", "'\\''") .. "'"
end

local function json_string(value)
  return '"' .. tostring(value)
    :gsub("\\", "\\\\")
    :gsub('"', '\\"')
    :gsub("\r", "\\r")
    :gsub("\n", "\\n")
    :gsub("\t", "\\t") .. '"'
end

local function is_rankable(cand)
  local kind = cand.type or ""
  if kind ~= "table" and kind ~= "user_table" and kind ~= "sentence" and kind ~= "completion" then return false end
  local text = cand.text or ""
  return text ~= "" and not text:find("[A-Za-z0-9]", 1)
end

local function request_scores(context, candidates)
  local payload = {'{"context":', json_string(context or ""), ',"candidates":['}
  for i, text in ipairs(candidates) do
    if i > 1 then table.insert(payload, ",") end
    table.insert(payload, json_string(text))
  end
  table.insert(payload, "]}")
  local helper = HELPER or (root_dir() .. "/scripts/qingjian-rime-rank.sh")
  local command = "printf '%s\\n' " .. shell_quote(table.concat(payload)) .. " | " .. shell_quote(helper)
  local pipe = io.popen(command, "r")
  if not pipe then return nil end
  local output = pipe:read("*a") or ""
  pipe:close()
  local body = output:match('"scores"%s*:%s*%[(.-)%]')
  if not body then return nil end
  local scores = {}
  for number in body:gmatch("[-+]?%d+%.?%d*[eE]?[-+]?%d*") do table.insert(scores, tonumber(number)) end
  if #scores ~= #candidates then return nil end
  return scores
end

local function quality(cand) return tonumber(cand.quality) or 0 end

function M.init(env)
  HELPER = os.getenv("QINGJIAN_RIME_HELPER")
  env.history = ""
  env.commit_conn = env.engine.context.commit_notifier:connect(function(ctx)
    local text = ctx:get_commit_text()
    if text and text ~= "" then env.history = (env.history .. text):sub(-64) end
  end)
end

function M.func(translation, env)
  local buffered = {}
  for cand in translation:iter() do
    if #buffered < MAX_CANDIDATES then
      table.insert(buffered, { cand = cand, idx = #buffered + 1 })
    else
      yield(cand)
    end
  end

  local rankable = {}
  for _, item in ipairs(buffered) do
    if is_rankable(item.cand) then table.insert(rankable, item) end
  end
  if #rankable < 2 then
    for _, item in ipairs(buffered) do yield(item.cand) end
    return
  end

  local texts = {}
  for _, item in ipairs(rankable) do table.insert(texts, item.cand.text) end
  local scores = request_scores(env.history, texts)
  if not scores then
    for _, item in ipairs(buffered) do yield(item.cand) end
    return
  end
  for i, item in ipairs(rankable) do item.neural = scores[i] or -math.huge end

  -- Establish quality groups first.  A direct "within N" comparator is not
  -- transitive and would make table.sort unstable; this two-pass ordering is.
  table.sort(rankable, function(a, b)
    local qa, qb = quality(a.cand), quality(b.cand)
    if qa ~= qb then return qa > qb end
    return a.idx < b.idx
  end)
  local group = 0
  local anchor = nil
  for _, item in ipairs(rankable) do
    local current = quality(item.cand)
    if anchor == nil or anchor - current > QUALITY_WINDOW then
      group = group + 1
      anchor = current
    end
    item.group = group
  end
  table.sort(rankable, function(a, b)
    if a.group ~= b.group then return a.group < b.group end
    if a.neural ~= b.neural then return a.neural > b.neural end
    return a.idx < b.idx
  end)

  local next_rankable = 1
  for _, item in ipairs(buffered) do
    if is_rankable(item.cand) then
      yield(rankable[next_rankable].cand)
      next_rankable = next_rankable + 1
    else
      yield(item.cand)
    end
  end
end

return M
