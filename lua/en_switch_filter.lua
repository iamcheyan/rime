-- en_switch_filter.lua
-- 根据 enable_en 开关状态，过滤掉 easy_en 翻译器产生的候选
-- 开关为关闭（0）时，过滤掉所有来自 easy_en 的候选

local M = {}

function M.func(translation, env)
  local ctx = env.engine.context
  local en_on = ctx:get_option("enable_en")

  if en_on then
    -- 英文开关开启，直接放行所有候选
    for cand in translation:iter() do
      yield(cand)
    end
    return
  end

  -- 英文开关关闭，过滤掉 easy_en 的候选
  -- easy_en 的候选 namespace 对应 table_translator@easy_en 或 table_translator@easy_en_mix
  for cand in translation:iter() do
    -- 通过 type 和 preedit 判断：easy_en 产生的候选 preedit 与 text 均为英文
    -- 更可靠的判断：easy_en 的候选来自 abc segment，text 全为 ASCII 字母
    local text = cand.text or ""
    local is_ascii_word = string.match(text, "^[%a%-%'%.]+$") ~= nil

    if not is_ascii_word then
      yield(cand)
    end
  end
end

return M
