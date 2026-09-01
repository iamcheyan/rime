-- sentence_translator.lua
-- 动态多词流式组句引擎 (Dynamic Syllable-Based Sentence Composer)
-- 
-- 功能:
-- 当用户连续输入多词编码 (如 6 码看起来 + 4 码不错 = kjqillbuco) 时，
-- 自动通过动态规划算法将已有的 2字、3字、4字词及单字进行智能多词流式切分与动态拼接，
-- 无需在词库中硬编码超长组合，即可实现任意长句的流畅连续拼装输出！

local ROOT_DIR = nil
local CODE_DICT = nil
local MAX_STEP = 8 -- 4字词全码 8 码

local function dirname(path)
  return (path:gsub("[/\\][^/\\]+$", ""))
end

local function resolve_root_dir()
  if ROOT_DIR ~= nil then
    return ROOT_DIR
  end
  local source = debug.getinfo(1, "S").source or ""
  if string.sub(source, 1, 1) == "@" then
    source = string.sub(source, 2)
  end
  if source == "" then
    ROOT_DIR = "."
  else
    ROOT_DIR = dirname(dirname(source))
  end
  return ROOT_DIR
end

local function load_code_dict()
  if CODE_DICT ~= nil then
    return CODE_DICT
  end

  local dict = {}
  local root = resolve_root_dir()
  local source_files = {
    root .. "/sbzr.chrome.extension/dicts/sbzr.shortcut.dict.yaml",
    root .. "/sbzr.chrome.extension/dicts/sbzr.common-frequency.dict.yaml",
    root .. "/sbzr.chrome.extension/dicts/sbzr.len1.dict.yaml",
    root .. "/sbzr.chrome.extension/dicts/base.dict.yaml",
    root .. "/sbzr.chrome.extension/dicts/sbzr.full.dict.yaml",
  }

  for _, path in ipairs(source_files) do
    local fh = io.open(path, "r")
    if fh then
      local in_body = false
      for line in fh:lines() do
        if not in_body then
          if line == "..." then
            in_body = true
          end
        elseif line ~= "" and string.sub(line, 1, 1) ~= "#" then
          local text, code, w_str = line:match("^([^\t]+)\t([a-z]+)\t(%d+)")
          if text and code and w_str then
            local len_code = #code
            -- 仅索引 1~4 字基础成词 (2, 4, 6, 8 码)
            if len_code >= 2 and len_code <= 8 and len_code % 2 == 0 then
              local w = tonumber(w_str) or 1000
              local list = dict[code]
              if not list then
                dict[code] = { text = text, weight = w }
              elseif w > list.weight then
                list.text = text
                list.weight = w
              end
            end
          end
        end
      end
      fh:close()
    end
  end

  CODE_DICT = dict
  return dict
end

local function compose_sentence(input_str, dict)
  local n = #input_str
  if n < 6 or n % 2 ~= 0 then
    return nil
  end

  -- dp[i] = { text = ..., weight = ..., chunks = ... }
  local dp = {}
  dp[0] = { text = "", weight = 0, chunks = 0 }

  local steps = { 8, 6, 4, 2 } -- 优先长词: 4字(8) > 3字(6) > 2字(4) > 1字(2)

  for i = 0, n - 2, 2 do
    local prev = dp[i]
    if prev then
      for _, step in ipairs(steps) do
        local next_pos = i + step
        if next_pos <= n then
          local chunk_code = string.sub(input_str, i + 1, next_pos)
          local match = dict[chunk_code]
          if match then
            local new_weight = prev.weight + match.weight
            local new_chunks = prev.chunks + 1
            local existing = dp[next_pos]
            if not existing or new_chunks < existing.chunks or (new_chunks == existing.chunks and new_weight > existing.weight) then
              dp[next_pos] = {
                text = prev.text .. match.text,
                weight = new_weight,
                chunks = new_chunks,
              }
            end
          end
        end
      end
    end
  end

  if dp[n] and dp[n].chunks > 1 then
    return dp[n].text
  end
  return nil
end

local M = {}

function M.init(env)
  load_code_dict()
end

function M.func(input, seg, env)
  if #input < 6 then
    return
  end

  local dict = load_code_dict()
  local composed = compose_sentence(input, dict)
  if composed then
    local cand = Candidate("sentence", seg.start, seg._end, composed, "")
    cand.quality = 9500 -- 高质量整句置顶
    yield(cand)
  end
end

return M
