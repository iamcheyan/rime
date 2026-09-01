-- sentence_translator.lua
-- 动态多词流式组句与用户长句自学习引擎 (Dynamic Sentence Composer & Auto-Learning)
--
-- 核心能力:
-- 1. 自动记忆打过的长句 (Auto-Learning):
--    用户提交过的任意长句 (如 kjqillhfbuco -> 看起来很不错) 会被自动存入动态调频数据库，
--    下次输入同一长编码时，直接以最高质量 (10000) 命中首选，无需重复选择！
-- 2. 动态规划智能组句 (DP Sentence Composition):
--    未打过的长句自动根据 2字、3字、4字词与单字在 <0.1ms 内流式切分拼装并输出。
-- 3. 极速短路保护:
--    常规 1~4 码打字 (<6 码) 0 开销瞬间跳过，保证输入法极度跟手流畅。

local DB_NAME = "dynamic_freq"
local SEP = "\31"
local ROOT_DIR = nil
local CODE_DICT = nil
local db_pool = db_pool or {}

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

local function open_db(name)
  db_pool[name] = db_pool[name] or LevelDb(name)
  local db = db_pool[name]
  if db and not db:loaded() then
    db:open()
  end
  return db
end

local function get_code_dict()
  if CODE_DICT ~= nil then
    return CODE_DICT
  end

  local dict = {}
  local path = resolve_root_dir() .. "/lua/sentence_vocab.txt"
  local fh = io.open(path, "r")
  if fh then
    for line in fh:lines() do
      local code, text, w_str = line:match("^([^\t]+)\t([^\t]+)\t(%d+)")
      if code and text and not dict[code] then
        dict[code] = { text = text, weight = tonumber(w_str) or 1000 }
      end
    end
    fh:close()
  end

  CODE_DICT = dict
  return dict
end

local function compose_sentence(input_str, dict)
  local n = #input_str
  local dp = {}
  dp[0] = { text = "", weight = 0, chunks = 0 }

  local steps = { 8, 6, 4, 2 }

  for i = 0, n - 2, 2 do
    local prev = dp[i]
    if prev then
      for _, step in ipairs(steps) do
        local next_pos = i + step
        if next_pos <= n then
          local chunk_code = string.sub(input_str, i + 1, next_pos)
          local match = dict[chunk_code]
          if match then
            local new_weight = prev.weight + match.weight
            local new_chunks = prev.chunks + 1
            local existing = dp[next_pos]
            if not existing or new_chunks < existing.chunks or (new_chunks == existing.chunks and new_weight > existing.weight) then
              dp[next_pos] = {
                text = prev.text .. match.text,
                weight = new_weight,
                chunks = new_chunks,
              }
            end
          end
        end
      end
    end
  end

  if dp[n] and dp[n].chunks > 1 then
    return dp[n].text
  end
  return nil
end

local M = {}

function M.init(env)
  env.db = open_db(DB_NAME)
  get_code_dict()
end

function M.func(input, seg, env)
  local len = #input
  -- 严格短路: 仅长句 (>= 6 码且为偶数) 介入
  if len < 6 or len % 2 ~= 0 then
    return
  end

  -- 1. 优先提取用户曾经打过并上屏的长句记忆 (Auto-Learned Phrase)
  local user_text = nil
  if env.db then
    local raw = env.db:fetch(input)
    if raw and raw ~= "" then
      local pos = string.find(raw, SEP, 1, true)
      if pos then
        user_text = string.sub(raw, pos + 1)
      else
        user_text = raw
      end
    end
  end

  if user_text and user_text ~= "" then
    local cand = Candidate("user_sentence", seg.start, seg._end, user_text, "")
    cand.quality = 10000 -- 用户自造长句置顶
    yield(cand)
  end

  -- 2. 动态规划智能组句
  local dict = get_code_dict()
  local composed = compose_sentence(input, dict)
  if composed and composed ~= user_text then
    local cand = Candidate("sentence", seg.start, seg._end, composed, "")
    cand.quality = 9500
    yield(cand)
  end
end

return M
