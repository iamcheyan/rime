-- length_priority.lua
-- 候选词按字数排序：字少的优先，同字数保持原权重顺序。
-- 放在 dynamic_freq_filter 之前：用户手动选过的词由 dynamic_freq 提到最前，
-- 覆盖字数排序；其余候选一律"字少在前，字多在后"。

local M = {}
local MAX_BUFFER = 512

--- UTF-8 字符计数（不是字节数）
local function utf8len(s)
  return #(s:gsub("[\1-\127\194-\244][\128-\191]*", "x"))
end

function M.func(translation, env)
  local buffered = {}
  local count = 0
  local sorting = true

  for cand in translation:iter() do
    if sorting then
      count = count + 1
      buffered[count] = {
        cand = cand,
        idx = count,
        len = utf8len(cand.text),
      }
      if count >= MAX_BUFFER then
        sorting = false
        table.sort(buffered, function(a, b)
          if a.len ~= b.len then return a.len < b.len end
          return a.idx < b.idx
        end)
        for i = 1, #buffered do
          yield(buffered[i].cand)
        end
        buffered = nil
      end
    else
      yield(cand)
    end
  end

  if buffered and #buffered > 0 then
    table.sort(buffered, function(a, b)
      if a.len ~= b.len then return a.len < b.len end
      return a.idx < b.idx
    end)
    for i = 1, #buffered do
      yield(buffered[i].cand)
    end
  end
end

return M