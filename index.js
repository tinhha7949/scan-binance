// ================= SETUP =================
const BOT_TOKEN = process.env.BOT_TOKEN
const CHAT_ID = process.env.CHAT_ID

const LIMIT_15M = 300
const LIMIT_1H  = 200

const RR_THRESHOLD = 1.2
const RISK_PER_TRADE = 0.01
const ACCOUNT_BALANCE = 1000
const MIN_VOL_15M = 60000

let lastSignalTime = 0
let activeTrades = []

// ================= TELEGRAM =================
async function sendTelegram(msg){
    try{
        let url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`
        await fetch(url,{
            method:"POST",
            headers:{"Content-Type":"application/json"},
            body: JSON.stringify({ chat_id: CHAT_ID, text: msg })
        })
    }catch(e){
        console.log("❌ TELE:", e.message)
    }
}

// ================= INDICATORS =================
function ema(arr,p){
    let k=2/(p+1), e=arr[0]
    for(let i=1;i<arr.length;i++) e=arr[i]*k+e*(1-k)
    return e
}

function atr(data,p=14){
    let trs=[]
    for(let i=1;i<data.length;i++){
        let h=+data[i][2], l=+data[i][3], pc=+data[i-1][4]
        trs.push(Math.max(h-l, Math.abs(h-pc), Math.abs(l-pc)))
    }
    return trs.slice(-p).reduce((a,b)=>a+b,0)/p
}

// ================= DATA =================
async function getData(symbol, interval, limit){

    const urls = [
        `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
        `https://data-api.binance.vision/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
    ]

    for(let url of urls){
        for(let attempt=0; attempt<2; attempt++){
            try{
                let res = await fetch(url, { headers:{"User-Agent":"Mozilla/5.0"} })
                if(!res.ok) continue

                let data = await res.json()

                if(Array.isArray(data) && data.length > 50){
                    console.log("✅ DATA:", url.includes("fapi") ? "FUTURES" : "VISION")
                    return data
                }

            }catch(e){
                if(attempt===1) console.log("❌ DATA FAIL:", symbol)
            }
        }
    }

    return null
}

// ================= CORE LOGIC =================
async function coreLogic(data15, data1h){

    let closes = data15.map(x=>+x[4])
    let highs  = data15.map(x=>+x[2])
    let lows   = data15.map(x=>+x[3])
    let volumes= data15.map(x=>+x[5])
    let closes1h = data1h.map(x=>+x[4])

    let price = closes.at(-1)

    // ===== VOLUME =====
    let volAvg = volumes.slice(-30).reduce((a,b)=>a+b,0)/30
    let volNow = volumes.at(-1)

    if(volAvg < MIN_VOL_15M) return null
    if(volNow < volAvg * 1.2) return null

    // ===== EMA =====
    let ema20 = ema(closes.slice(-60),20)
    let ema50 = ema(closes.slice(-120),50)

    let ema20_1h = ema(closes1h.slice(-60),20)
    let ema50_1h = ema(closes1h.slice(-120),50)

    // ===== TREND STRENGTH =====
    let trendLTF = Math.abs(ema20 - ema50) / price
    let trendHTF = Math.abs(ema20_1h - ema50_1h) / price

    // ❗ BẮT BUỘC có trend
    if(trendLTF < 0.0015 || trendHTF < 0.0015) return null

    // ===== ATR =====
    let atrVal = atr(data15.slice(-100))
    if(atrVal / price < 0.0025) return null

    // ===== COMPRESSION =====
    let range = (Math.max(...highs.slice(-25)) - Math.min(...lows.slice(-25))) / price
    if(range > 0.018) return null

    // ===== BREAKOUT =====
    let prevHigh = Math.max(...highs.slice(-25,-1))
    let prevLow  = Math.min(...lows.slice(-25,-1))

    let breakoutUp = price > prevHigh
    let breakoutDown = price < prevLow

    if(!breakoutUp && !breakoutDown) return null

    // ===== TREND FILTER CHẶT =====
    let trendLong = ema20 > ema50 && ema20_1h > ema50_1h
    let trendShort = ema20 < ema50 && ema20_1h < ema50_1h

    if(breakoutUp && !trendLong) return null
    if(breakoutDown && !trendShort) return null

    // ===== RETEST =====
    let retestLong = Math.abs(price - prevHigh) / price < 0.0015
    let retestShort = Math.abs(price - prevLow) / price < 0.0015

    if(breakoutUp && !retestLong) return null
    if(breakoutDown && !retestShort) return null

    // ===== ANTI FAKE BREAKOUT =====
    let lastCandleRange = highs.at(-1) - lows.at(-1)
    if(lastCandleRange > atrVal * 2.5) return null

    // ===== ENTRY =====
    let side = breakoutUp ? "LONG" : "SHORT"
    let entry = breakoutUp ? prevHigh : prevLow

    let sl = breakoutUp
        ? prevLow - atrVal * 0.3
        : prevHigh + atrVal * 0.3

    let risk = Math.abs(entry - sl)

    // ❗ tăng RR lên để lọc kèo rác
    let tp = breakoutUp
        ? entry + risk * 1.5
        : entry - risk * 1.5

    let rr = Math.abs(tp - entry) / risk
    if(rr < 1.2) return null

    return {
        side,
        entry,
        sl,
        tp,
        atr: atrVal
    }
}
// ================= CHECK RESULT =================
async function checkTrades(){

    if(activeTrades.length === 0) return

    let data = await getData("BTCUSDT","1m",2)
    if(!data) return

    let price = +data.at(-1)[4]

    for(let i = activeTrades.length -1; i>=0; i--){

        let t = activeTrades[i]

        let now = Date.now()
let duration = now - t.time

// 6 giờ = 21600000 ms
if(duration > 21600000){

    let msg = `⏰ TIMEOUT 6H
${t.symbol}
${t.side}
ENTRY: ${t.price}
SL: ${t.sl}
TP: ${t.tp}`

    await sendTelegram(msg)

    activeTrades.splice(i,1)
    continue
}

        let win = false
        let done = false

        if(t.side === "LONG"){
            if(price >= t.tp){ win=true; done=true }
            if(price <= t.sl){ done=true }
        }

        if(t.side === "SHORT"){
            if(price <= t.tp){ win=true; done=true }
            if(price >= t.sl){ done=true }
        }

        let timeout = Date.now() - t.time > 6 * 60 * 60 * 1000

        if(done || timeout){

            let msg = `📊 RESULT BTC
${t.side}
${win ? "✅ WIN" : "❌ LOSS"}`

            await sendTelegram(msg)

            activeTrades.splice(i,1)
            
        }
    }
}

// ================= LOOP =================
setInterval(scanner, 300000)
setInterval(checkTrades, 60000)

scanner()
