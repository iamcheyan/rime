local SINGLE_CODE_MAP = {
  a = { ["啊"] = true },
  b = { ["不"] = true },
  c = { ["出"] = true },
  d = { ["的"] = true },
  f = { ["发"] = true },
  g = { ["个"] = true },
  h = { ["和"] = true },
  i = { ["爱"] = true },
  j = { ["就"] = true },
  k = { ["可"] = true },
  l = { ["了"] = true },
  m = { ["没"] = true },
  n = { ["你"] = true },
  o = { ["哦"] = true },
  p = { ["平"] = true },
  q = { ["去"] = true },
  r = { ["人"] = true },
  s = { ["是"] = true },
  t = { ["他"] = true },
  u = { ["无"] = true },
  v = { ["而"] = true, ["娥"] = true },
  w = { ["我"] = true },
  x = { ["下"] = true },
  y = { ["一"] = true },
  z = { ["在"] = true },
}

local M = {}

function M.func(translation, env)
  local input = env.engine.context.input
  if not input or string.len(input) ~= 1 then
    for cand in translation:iter() do
      yield(cand)
    end
    return
  end

  local allowed = SINGLE_CODE_MAP[string.lower(input)]
  if not allowed then
    for cand in translation:iter() do
      yield(cand)
    end
    return
  end

  for cand in translation:iter() do
    if allowed[cand.text] then
      yield(cand)
    end
  end
end

return M
