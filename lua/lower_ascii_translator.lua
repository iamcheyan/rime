local ASCII_QUALITY = -100

local function normalize_ascii(input)
  if not input or input == "" then
    return nil
  end
  if not string.match(input, "^[A-Za-z%-]+$") then
    return nil
  end
  return string.lower(input)
end

local M = {}

function M.func(input, seg, env)
  local lower = normalize_ascii(input)
  if not lower then
    return
  end

  local cand = Candidate("lower_ascii", seg.start, seg._end, lower, "〔ascii〕")
  cand.quality = ASCII_QUALITY
  yield(cand)
end

return M
