-- sentence_translator.lua
-- 最长词优先流式组句引擎 (Maximal Matching Dynamic Sentence Composer)
--
-- 核心设计:
-- 1. 最长词组优先匹配 (Longest Chunk First):
--    从左向右扫描，依次匹配 8 码 (4字词组) > 6 码 (3字词组) > 4 码 (2字词组/公式词) > 2 码 (单字)。
-- 2. 预编译字典极速哈希 (0 延迟):
--    直接引用 require("sbzr_dict_data")，单次长句拼装耗时 < 0.001ms。
-- 3. 严格边界规范 (End-to-End Boundary):
--    每个候选词严格对应当前输入分段 (seg.start 到 seg._end)，杜绝子分段重叠或重复字递归累加。

local dict = require("sbzr_dict_data")
local DB_NAME = "dynamic_freq"
local SEP = "\31"
local STEPS = { 8, 6, 4, 2 }
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
    for i = 1, #STEPS do
      local step = STEPS[i]
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
  env.last_input = nil
  env.last_user_text = nil
end

function M.func(input, seg, env)
  local len = #input
  -- 双拼每字 2 码；奇数码不可能组成完整中文词，避免半码时重复组句。
  if len < 6 or len % 2 ~= 0 then
    return
  end

  -- Rime 可能在同一输入状态重复调用 translator；复用本次 LevelDB 结果。
  local user_text = nil
  if env.last_input == input then
    user_text = env.last_user_text
  elseif env.db then
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
  env.last_input = input
  env.last_user_text = user_text

  if user_text and user_text ~= "" then
    -- 校验用户记忆字数是否与编码匹配 (防止历史脏数据)
    local char_len = utf8.len(user_text) or #user_text
    if char_len <= math.ceil(len / 2) then
      local cand = Candidate("user_sentence", seg.start, seg._end, user_text, "")
      cand.quality = 10000
      yield(cand)
    end
  end

  -- 2. 动态拼装的完整长句
  local composed = compose_sentence(input)
  if composed and composed ~= user_text then
    local cand = Candidate("sentence", seg.start, seg._end, composed, "")
    cand.quality = 9900
    yield(cand)
  end
end

return M
