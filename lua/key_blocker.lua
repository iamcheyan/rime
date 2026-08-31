-- key_blocker.lua
-- Safely consumes and blocks problematic hotkeys like Shift+Alt+Space
-- to prevent macOS non-breaking space injection and switcher deadlock.

local function key_blocker(key, env)
    if (key.keycode == 32 or key.keycode == 0x20) and key:alt() and key:shift() then
        return 1 -- 1 = kAccepted (silently consume and drop the event)
    end
    return 2 -- 2 = kNoop (pass through all other keys)
end

return key_blocker
