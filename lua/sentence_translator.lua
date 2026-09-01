-- sentence_translator.lua
-- 最长词优先流式组句引擎 (Maximal Matching Dynamic Sentence Composer)
--
-- 核心原理:
-- 1. 最长词组优先匹配 (Longest Chunk First):
--    从左向右扫描，优先匹配 8 码 (4字词组) > 6 码 (3字词组) > 4 码 (2字词组/公式词) > 2 码 (单字)。
-- 2. 预编译字典极速哈希 (0 延迟):
--    直接引用 require("sbzr_dict_data")，启动即载入内存，单次长句拼装耗时 < 0.001ms。
-- 3. 用户历史记忆与自造长句置顶:
--    用户提交过的任何长句直接以最高优先级 (10000) 提取置顶！

local dict = require("sbzr_dict_data")
local DB_NAME = "dynamic_freq"
local SEP = "\31"
local db_pool = db_pool or {}

local function open_db(name)
  db_pool[name] = db_pool[name] or LevelDb(name)
  local db = db_pool[name]
  if db and not db:loaded() then
    db:open()
  end
  return db
end

-- 最长词优先贪心分词与动态流式拼接
local function compose_sentence(input_str)
  local n = #input_str
  local pos = 1
  local chunks = {}

  while pos <= n do
    local matched_text = nil
    local matched_step = 0

    -- 最长词优先: 8(4字) > 6(3字) > 4(2字) > 2(单字)
    for _, step in ipairs({ 8, 6, 4, 2 }) do
      if pos + step - 1 <= n then
        local code = string.sub(input_str, pos, pos + step - 1)
        local text = dict[code]
        if text then
          matched_text = text
          matched_step = step
          break
        end
      end
    end

    if matched_text then
      table.insert(chunks, matched_text)
      pos = pos + matched_step
    else
      return nil
    end
  end

  if #chunks > 0 then
    return table.concat(chunks, "")
  end
  return nil
end

local M = {}

function M.init(env)
  env.db = open_db(DB_NAME)
end

function M.func(input, seg, env)
  local len = #input
  -- 仅在输入 >= 6 码长句时介入
  if len < 6 then
    return
  end

  -- 1. 用户历史打过的自造长句优先置顶
  local user_text = nil
  if env.db then
    local raw = env.db:fetch(input)
    if raw and raw ~= "" then
      local p = string.find(raw, SEP, 1, true)
      if p then
        user_text = string.sub(raw, p + 1)
      else
        user_text = raw
      end
    end
  end

  if user_text and user_text ~= "" then
    local cand = Candidate("user_sentence", seg.start, seg._end, user_text, "")
    cand.quality = 10000 -- 历史记忆最高优先级置顶
    yield(cand)
  end

  -- 2. 最长词优先智能流式组句
  local composed = compose_sentence(input)
  if composed and composed ~= user_text then
    local cand = Candidate("sentence", seg.start, seg._end, composed, "")
    cand.quality = 9500 -- 动态组句置顶
    yield(cand)
  end
end

return M
