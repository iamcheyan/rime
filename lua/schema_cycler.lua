-- schema_cycler.lua
-- 循环切换 4 种方案：sbzr -> sbzr_mix -> jaroomaji -> easy_en

local schemas = {
    "sbzr",
    "sbzr_mix",
    "jaroomaji",
    "easy_en"
}

local function get_next_schema(current)
    for i, s in ipairs(schemas) do
        if s == current then
            return schemas[(i % #schemas) + 1]
        end
    end
    return schemas[1]
end

local function schema_cycler(key, env)
    -- 捕获 Alt+Space 或 Control+Space (Space keycode: 32 / 0x20)
    -- 必须在 key down (not key:release()) 时触发
    if (key.keycode == 32 or key.keycode == 0x20) and (key:alt() or key:ctrl()) and not key:release() then
        local current = env.engine.schema.schema_id
        local target = get_next_schema(current)
        env.engine:apply_schema(Schema(target))
        return 1 -- 1 = kAccepted (消费事件)
    end
    return 2 -- 2 = kNoop (放行)
end

return schema_cycler
