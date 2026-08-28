-- length_priority.lua
-- Candidate ordering: quality first, with a bounded length tie-break.
-- The dynamic-frequency filter remains after this filter in sbzr.schema.yaml;
-- quality-first keeps a recently selected high-quality candidate in its scan
-- window without deleting any candidate.

local M = {}
local MAX_BUFFER = 512
local QUALITY_TIE_WINDOW = 100

--- UTF-8 字符计数（不是字节数）
local function utf8len(s)
  return #(s:gsub("[\1-\127\194-\244][\128-\191]*", "x"))
end

local function candidate_quality(cand)
  local quality = tonumber(cand.quality)
  if quality == nil then
    return 0
  end
  return quality
end

local function sort_buffer(buffered)
  -- First impose a strict quality order.  Pairwise "within N" comparisons
  -- are not transitive, so table.sort must not receive that comparator.
  table.sort(buffered, function(a, b)
    if a.quality ~= b.quality then
      return a.quality > b.quality
    end
    return a.idx < b.idx
  end)

  -- Partition at the highest quality in each group.  Length is only used
  -- inside a group whose quality is within the explicit small window.
  local group = 0
  local anchor_quality = nil
  for i = 1, #buffered do
    local item = buffered[i]
    if anchor_quality == nil or anchor_quality - item.quality > QUALITY_TIE_WINDOW then
      group = group + 1
      anchor_quality = item.quality
    end
    item.group = group
  end

  table.sort(buffered, function(a, b)
    if a.group ~= b.group then
      return a.group < b.group
    end
    if a.len ~= b.len then
      return a.len < b.len
    end
    if a.quality ~= b.quality then
      return a.quality > b.quality
    end
    return a.idx < b.idx
  end)
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
        quality = candidate_quality(cand),
      }
      if count >= MAX_BUFFER then
        sorting = false
        sort_buffer(buffered)
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
    sort_buffer(buffered)
    for i = 1, #buffered do
      yield(buffered[i].cand)
    end
  end
end

return M