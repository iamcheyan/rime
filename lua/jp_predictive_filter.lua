-- jp_predictive_filter.lua
-- 日语智能前缀预测补全过滤器 (Japanese Predictive Completion Filter)
-- 当输入罗马字前缀时，智能提升高频预测词并打上 〔予測〕 提示

local M = {}

-- 常见日语高频前缀预测快速查找表 (音节 -> 预测词列表)
local PREDICTION_MAP = {
    -- arigatou 系列
    ["ari"] = { "ありがとう", "ありがとうございます", "有り難うございます" },
    ["arig"] = { "ありがとう", "ありがとうございます", "ありがとうございました" },
    ["ariga"] = { "ありがとう", "ありがとうございます", "ありがとうございました" },
    ["arigat"] = { "ありがとう", "ありがとうございます", "ありがとうございました" },
    ["arigato"] = { "ありがとう", "ありがとうございます", "ありがとうございました" },
    ["arigatou"] = { "ありがとうございます", "ありがとうございました" },

    -- otsukaresama 系列
    ["ots"] = { "お疲れ様です", "お疲れ様でした" },
    ["otsu"] = { "お疲れ様です", "お疲れ様でした" },
    ["otuk"] = { "お疲れ様です", "お疲れ様でした" },
    ["otsuk"] = { "お疲れ様です", "お疲れ様でした" },
    ["otsuka"] = { "お疲れ様です", "お疲れ様でした" },
    ["otsukare"] = { "お疲れ様です", "お疲れ様でした" },

    -- yoroshiku 系列
    ["yor"] = { "よろしくお願いします", "よろしくお願いいたします" },
    ["yoro"] = { "よろしくお願いします", "よろしくお願いいたします" },
    ["yoros"] = { "よろしくお願いします", "よろしくお願いいたします" },
    ["yorosi"] = { "よろしくお願いします", "よろしくお願いいたします" },
    ["yorosh"] = { "よろしくお願いします", "よろしくお願いいたします" },
    ["yoroshi"] = { "よろしくお願いします", "よろしくお願いいたします" },

    -- sumimasen / mousiwake 系列
    ["sum"] = { "すみません" },
    ["sumi"] = { "すみません" },
    ["mous"] = { "申し訳ございません", "申し訳ありません" },
    ["mousi"] = { "申し訳ございません", "申し訳ありません" },
    ["moushi"] = { "申し訳ございません", "申し訳ありません" },

    -- ohayou / konnichiha 系列
    ["oha"] = { "おはようございます" },
    ["ohay"] = { "おはようございます" },
    ["ohayo"] = { "おはようございます" },
    ["kon"] = { "こんにちは", "こんばんは" },
    ["konn"] = { "こんにちは", "こんばんは" },
    ["konni"] = { "こんにちは" },
    ["konba"] = { "こんばんは" },

    -- osewa 系列
    ["ose"] = { "お世話になっております", "いつもお世話になっております" },
    ["osew"] = { "お世話になっております", "いつもお世話になっております" },
    ["osewa"] = { "お世話になっております", "いつもお世話になっております" },

    -- kakunin / syouti 系列
    ["kaku"] = { "ご確認ください", "ご確認よろしくお願いいたします" },
    ["kakun"] = { "ご確認ください", "ご確認よろしくお願いいたします" },
    ["syou"] = { "承知いたしました" },
    ["syo"] = { "承知いたしました" },
    ["kasi"] = { "かしこまりました" },
    ["kasiko"] = { "かしこまりました" },
    ["situ"] = { "失礼いたします", "失礼いたしました" },
    ["dai"] = { "大丈夫です" },
    ["mond"] = { "問題ありません" },
}

function M.func(input_stream, env)
    local context = env.engine.context
    local raw_input = context.input or ""
    if #raw_input < 3 then
        for cand in input_stream:iter() do
            yield(cand)
        end
        return
    end

    local input_str = raw_input:lower():gsub("[%s%-]", "")
    local predictions = PREDICTION_MAP[input_str]
    if not predictions then
        -- Most keystrokes are not registered prediction prefixes; avoid scanning
        -- and rebuilding any state for the entire candidate stream.
        for cand in input_stream:iter() do
            yield(cand)
        end
        return
    end

    -- Only the few injected predictions need duplicate checks. The downstream
    -- uniquifier already handles duplicates among ordinary candidates; keeping a
    -- seen table for the whole stream made prediction hits needlessly expensive.
    local predicted = {}
    for _, text in ipairs(predictions) do
        predicted[text] = true
    end

    local native_emitted = false
    for cand in input_stream:iter() do
        if not native_emitted then
            native_emitted = true
            yield(cand)
            for _, text in ipairs(predictions) do
                if text ~= cand.text then
                    local pred_cand = Candidate("jp_predict", cand.start, cand._end, text, "〔予測〕")
                    pred_cand.quality = (cand.quality or 100) + 1000
                    yield(pred_cand)
                end
            end
        elseif not predicted[cand.text] then
            -- Mark long completion candidates without constructing a global set.
            if cand.type == "completion" and #cand.text > 2 and cand.comment == "" then
                cand.comment = "〔予測〕"
            end
            yield(cand)
        end
    end

    -- If the normal translator produced no candidate, retain the prediction
    -- fallback with the correct segment range.
    if not native_emitted then
        for _, text in ipairs(predictions) do
            local pred_cand = Candidate("jp_predict", 0, #raw_input, text, "〔予測〕")
            pred_cand.quality = 1000
            yield(pred_cand)
        end
    end
end

return M
