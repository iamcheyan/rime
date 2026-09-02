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

  -- Japanese/Chinese candidates begin with a UTF-8 byte >= 0x80. Only
  -- ASCII candidates can be easy_en words, so avoid regex work for CJK text.
  for cand in translation:iter() do
    local text = cand.text or ""
    local first_byte = string.byte(text)
    if first_byte and first_byte >= 128 then
      yield(cand)
    elseif string.match(text, "^[%a%-%'%.]+$") == nil then
      yield(cand)
    end
  end
end

return M
