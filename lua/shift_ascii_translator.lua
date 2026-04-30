local ASCII_QUALITY = 900000000

local function should_offer_ascii(input)
  if not input or input == "" then
    return false
  end
  if not string.find(input, "%u") then
    return false
  end
  return string.match(input, "^[A-Za-z%-]+$") ~= nil
end

local M = {}

function M.func(input, seg, env)
  if not should_offer_ascii(input) then
    return
  end

  local cand = Candidate("shift_ascii", seg.start, seg._end, input, "〔ASCII〕")
  cand.quality = ASCII_QUALITY
  yield(cand)
end

return M
