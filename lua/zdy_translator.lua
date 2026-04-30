local ROOT_DIR = nil
local ZDY_CODE_MAP = nil
local ZDY_QUALITY = 1000000000

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

local function load_zdy_code_map()
  if ZDY_CODE_MAP ~= nil then
    return ZDY_CODE_MAP
  end

  local path = resolve_root_dir() .. "/sbzr.chrome.extension/dicts/zdy.dict.yaml"
  local fh = io.open(path, "r")
  local code_map = {}
  if not fh then
    ZDY_CODE_MAP = code_map
    return code_map
  end

  for line in fh:lines() do
    if line ~= "" and string.sub(line, 1, 1) ~= "#" then
      local text, code = line:match("^([^\t]+)\t([^\t]+)\t")
      if text and code and text ~= "..." and text ~= "---" then
        local entries = code_map[code]
        if not entries then
          entries = {}
          code_map[code] = entries
        end
        table.insert(entries, text)
      end
    end
  end
  fh:close()

  ZDY_CODE_MAP = code_map
  return code_map
end

local M = {}

function M.func(input, seg, env)
  if not input or input == "" then
    return
  end

  local code_map = load_zdy_code_map()
  local entries = code_map[input]
  if not entries then
    return
  end

  local emitted = {}
  for _, text in ipairs(entries) do
    if not emitted[text] then
      emitted[text] = true
      local cand = Candidate("zdy", seg.start, seg._end, text, "〔自定义〕")
      cand.quality = ZDY_QUALITY
      yield(cand)
    end
  end
end

return M
