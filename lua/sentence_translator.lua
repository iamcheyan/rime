-- sentence_translator.lua
-- 最长词优先流式组句与前缀词组优先候选引擎
--
-- 核心优化:
-- 1. 长句优先输出 (Quality 10000):
--    通过最长词优先算法拼装出完整整句 (如: 每天都很好看 / 看起来很不错)。
-- 2. 词组优先于单字 (Prefix Word Priority, Quality 9800 ~ 9400):
--    在长句输入模式下，依次生成 8 码、6 码、4 码前缀词组 (如: 每天 / 每天都 / 看起来)，
--    让候选栏第一位是整句，第二位是开头的词组，彻底压制单字 (妹/没/美)，方便用户按词组分步选词或一键上屏整句！
-- 3. 用户历史自造长句最高置顶:
--    用户上屏过的专属长句从 LevelDB 快速提取置顶。

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
  if len < 6 then
    return
  end

  -- 1. 用户历史打过的自造长句最高优先级
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
    cand.quality = 10000
    yield(cand)
  end

  -- 2. 动态拼装的完整长句 (第 1 候选)
  local composed = compose_sentence(input)
  if composed and composed ~= user_text then
    local cand = Candidate("sentence", seg.start, seg._end, composed, "")
    cand.quality = 9900
    yield(cand)
  end

  -- 3. 前缀词组优先输出 (第 2~4 候选，保证词组优先于单字)
  local emitted_prefixes = {}
  if composed then
    emitted_prefixes[composed] = true
  end

  -- 尝试 4 码前缀词组 (如: 每天 mztm / 精神 jysf / 看起来 kqll)
  if len >= 4 then
    local code4 = string.sub(input, 1, 4)
    local word4 = dict[code4]
    if word4 and not emitted_prefixes[word4] then
      emitted_prefixes[word4] = true
      local cand = Candidate("sentence_prefix", seg.start, seg.start + 4, word4, "")
      cand.quality = 9600
      yield(cand)
    end
  end

  -- 尝试 6 码前缀词组 (如: 看起来 kjqill / 一大把 yidaba / 周六日 zblqri)
  if len >= 6 then
    local code6 = string.sub(input, 1, 6)
    local word6 = dict[code6]
    if word6 and not emitted_prefixes[word6] then
      emitted_prefixes[word6] = true
      local cand = Candidate("sentence_prefix", seg.start, seg.start + 6, word6, "")
      cand.quality = 9500
      yield(cand)
    end
  end

  -- 尝试 8 码前缀词组 (如: 天下无敌 tmxwwudi / 人工智能 rfgszing)
  if len >= 8 then
    local code8 = string.sub(input, 1, 8)
    local word8 = dict[code8]
    if word8 and not emitted_prefixes[word8] then
      emitted_prefixes[word8] = true
      local cand = Candidate("sentence_prefix", seg.start, seg.start + 8, word8, "")
      cand.quality = 9400
      yield(cand)
    end
  end
end

return M
