-- schema_toggle.lua
-- A ⇄ B Toggle: 1-click instant toggle between Primary schema (sbzr) and Secondary schema (sbzr_mix / jaroomaji)

local PRIMARY_SCHEMA = "sbzr"
local DEFAULT_SECONDARY = "sbzr_mix"
local last_secondary = DEFAULT_SECONDARY

local function schema_toggle(key, env)
    -- 捕获 Alt+Space (Option+Space) 或 Control+Space
    if (key.keycode == 32 or key.keycode == 0x20) and (key:alt() or key:ctrl()) and not key:shift() and not key:release() then
        local current = env.engine.schema.schema_id
        local target

        if current == PRIMARY_SCHEMA then
            -- 当前是主方案（中文）-> 切到最近使用的副方案（混输或日语）
            target = last_secondary or DEFAULT_SECONDARY
        else
            -- 当前是副方案 -> 记忆当前副方案，并切回主方案（中文）
            last_secondary = current
            target = PRIMARY_SCHEMA
        end

        if target and target ~= current then
            pcall(function()
                env.engine:apply_schema(Schema(target))
            end)
        end
        return 1 -- 1 = kAccepted (消费事件，不打出空格)
    end
    return 2 -- 2 = kNoop (放行)
end

return schema_toggle
