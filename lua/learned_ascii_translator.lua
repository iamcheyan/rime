local ascii_learning = require("ascii_learning")

local LEARNED_ASCII_QUALITY = 800000000

local function should_offer(input)
  if not input or input == "" then
    return false
  end
  return string.match(input, "^[A-Za-z%-]+$") ~= nil
end

local M = {}

function M.func(input, seg, env)
  if not should_offer(input) then
    return
  end

  local matches = ascii_learning.query(input, 6)
  for _, match in ipairs(matches) do
    local cand = Candidate("learned_ascii", seg.start, seg._end, match.text, "〔学英〕")
    cand.quality = LEARNED_ASCII_QUALITY
    yield(cand)
  end
end

return M
