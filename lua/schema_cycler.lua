-- schema_cycler.lua
-- 4 种方案双向循环切换：
-- 正选 (Alt/Ctrl+Space): sbzr -> sbzr_mix -> jaroomaji -> easy_en -> sbzr
-- 反选 (Shift+Alt/Ctrl+Space): sbzr -> easy_en -> jaroomaji -> sbzr_mix -> sbzr

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

local function get_prev_schema(current)
    for i, s in ipairs(schemas) do
        if s == current then
            local prev_idx = i - 1
            if prev_idx < 1 then
                prev_idx = #schemas
            end
            return schemas[prev_idx]
        end
    end
    return schemas[#schemas]
end

local function schema_cycler(key, env)
    -- 捕获 Alt+Space、Shift+Alt+Space 或 Control+Space、Shift+Control+Space (Space keycode: 32 / 0x20)
    if (key.keycode == 32 or key.keycode == 0x20) and (key:alt() or key:ctrl()) and not key:release() then
        local current = env.engine.schema.schema_id
        local target
        if key:shift() then
            -- 按住 Shift：反向切换
            target = get_prev_schema(current)
        else
            -- 普通模式：正向切换
            target = get_next_schema(current)
        end
        env.engine:apply_schema(Schema(target))
        return 1 -- 1 = kAccepted (消费事件，不打出空格)
    end
    return 2 -- 2 = kNoop (放行)
end

return schema_cycler
