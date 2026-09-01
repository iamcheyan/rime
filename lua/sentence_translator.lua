-- sentence_translator.lua
-- 动态多词流式组句引擎 (Dynamic Syllable-Based Sentence Composer) - 极速零延迟版
--
-- 性能优化:
-- 1. 快速短路: 仅在用户输入 >= 6 码 (且为偶数长度) 时触发，常规 1~4 码打字 0 开销瞬间跳过。
-- 2. 专用预热索引: 仅加载 lua/sentence_vocab.txt (预编译词典)，全局常驻内存，0 磁盘 I/O 开销。
-- 3. 极速动态规划: 快速贪心/动态规划多词切分拼接，耗时 < 0.1ms。

local ROOT_DIR = nil
local CODE_DICT = nil

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

local function get_code_dict()
  if CODE_DICT ~= nil then
    return CODE_DICT
  end

  local dict = {}
  local path = resolve_root_dir() .. "/lua/sentence_vocab.txt"
  local fh = io.open(path, "r")
  if fh then
    for line in fh:lines() do
      local code, text, w_str = line:match("^([^\t]+)\t([^\t]+)\t(%d+)")
      if code and text and not dict[code] then
        dict[code] = { text = text, weight = tonumber(w_str) or 1000 }
      end
    end
    fh:close()
  end

  CODE_DICT = dict
  return dict
end

local function compose_sentence(input_str, dict)
  local n = #input_str
  -- dp[i] = { text = ..., weight = ..., chunks = ... }
  local dp = {}
  dp[0] = { text = "", weight = 0, chunks = 0 }

  local steps = { 8, 6, 4, 2 }

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
  get_code_dict()
end

function M.func(input, seg, env)
  -- 严格短路保护: 必须 >= 6 码且为偶数长度 (每字 2 码双拼)
  local len = #input
  if len < 6 or len % 2 ~= 0 then
    return
  end

  local dict = get_code_dict()
  local composed = compose_sentence(input, dict)
  if composed then
    local cand = Candidate("sentence", seg.start, seg._end, composed, "")
    cand.quality = 9500
    yield(cand)
  end
end

return M
