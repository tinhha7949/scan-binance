// ================= SETUP =================
const BOT_TOKEN = process.env.BOT_TOKEN
const CHAT_ID = process.env.CHAT_ID

const LIMIT_15M = 300
const LIMIT_1H  = 200

const RR_THRESHOLD = 1.2
const RISK_PER_TRADE = 0.005
const ACCOUNT_BALANCE = 1000
const MIN_VOL_15M = 200000

let isScanning = false
let lastSignalTime = 0
let activeTrades = []

// ================= TELEGRAM =================
async function sendTelegram(msg){
    try{
        let url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`
        let res = await fetch(url,{
            method:"POST",
            headers:{"Content-Type":"application/json"},
            body: JSON.stringify({ chat_id: CHAT_ID, text: msg })
        })

        let data = await res.json()

        if(!data.ok){
            console.log("❌ TELE FAIL:", data)
        }

        return data.ok

    }catch(e){
        console.log("❌ TELE ERROR:", e.message)
        return false
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
// ============= DATA ENTRY 1M =============
function getBetterEntry(r, data1m){

    let closes = data1m.map(x=>+x[4])
    let highs  = data1m.map(x=>+x[2])
    let lows   = data1m.map(x=>+x[3])

    let price = closes.at(-1)

    // ===== LONG =====
    if(r.side === "LONG"){

    let recentLow = Math.min(...lows.slice(-5))

    // ✅ nếu đang đi mạnh → vào luôn
    if(price > r.entry * 1.0015){
        return price
    }

    // pullback nhẹ
    if(price <= r.entry * 1.001){
        return price
    }

    return recentLow
}

    // ===== SHORT =====
    if(r.side === "SHORT"){

    let recentHigh = Math.max(...highs.slice(-5))

    if(price < r.entry * 0.9985){
        return price
    }

    if(price >= r.entry * 0.999){
        return price
    }

    return recentHigh
}
}
// ================= DATA =================
async function getData(symbol, interval, limit){

    let is1m = interval === "1m"

    const urls = is1m
        ? [
            // 🔥 ưu tiên spot cho 1m (ổn định hơn)
            `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
            `https://data-api.binance.vision/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
            `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
        ]
        : [
            // timeframe lớn vẫn dùng futures trước
            `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
            `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
            `https://data-api.binance.vision/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
        ]

    for(let url of urls){
        for(let attempt=0; attempt<2; attempt++){
            try{
                let res = await fetch(url, {
                    headers:{"User-Agent":"Mozilla/5.0"},
                    timeout: 5000
                })

                if(!res.ok) continue

                let data = await res.json()

                if(Array.isArray(data) && data.length >= limit * 0.7){
                    return data
                }

            }catch(e){
                if(attempt === 1){
                    console.log(`❌ DATA FAIL ${interval}:`, symbol)
                }
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

    let volAvgUSDT = volAvg * price
    let volNowUSDT = volNow * price
 
    if(volAvgUSDT < MIN_VOL_15M) return null
    if(volNowUSDT < volAvgUSDT * 1.05) return null // giảm nhẹ

    // ===== EMA =====
    let ema20 = ema(closes.slice(-60),20)
    let ema50 = ema(closes.slice(-120),50)

    let ema20_1h = ema(closes1h.slice(-60),20)
    let ema50_1h = ema(closes1h.slice(-120),50)
     // ===== TREND FILTER =====
    let trendLong = ema20 > ema50 && ema20_1h > ema50_1h
    let trendShort = ema20 < ema50 && ema20_1h < ema50_1h

    // ===== TREND =====
    let trendLTF = Math.abs(ema20 - ema50) / price
    let trendHTF = Math.abs(ema20_1h - ema50_1h) / price

    if(trendLTF < 0.001 || trendHTF < 0.001) return null

    // ===== ATR =====
    let atrVal = atr(data15.slice(-100))
    if(atrVal / price < 0.0012) return null // 0.0018

    // ===== COMPRESSION =====
    let range = (Math.max(...highs.slice(-25)) - Math.min(...lows.slice(-25))) / price
    if(range > 0.015) return null // nới nhẹ 0.03

    // ===== BREAKOUT =====
    let prevHigh = Math.max(...highs.slice(-25,-1))
    let prevLow  = Math.min(...lows.slice(-25,-1))

    let breakoutUp = price > prevHigh
    let breakoutDown = price < prevLow

    if(!breakoutUp && !breakoutDown) return null

    if(breakoutUp && !trendLong) return null
    if(breakoutDown && !trendShort) return null

    // ===== MOMENTUM MODE =====
let momentum = (price - closes.at(-5)) / price
let momentumVol = volNowUSDT > volAvgUSDT  * 1.05 //1.1

// LONG
if(breakoutUp && trendLong && momentum > 0.003 && momentumVol){
    let entry = price
    let sl = entry - atrVal * 1.2
    let tp = entry + atrVal * 3.5

    let risk = Math.abs(entry - sl)
    let rr = Math.abs(tp - entry) / risk

    if(rr >= 1.2){
        return {
            side: "LONG",
            entry,
            sl,
            tp,
            rr,
            atr: atrVal,
            type: "MOMENTUM"
        }
    }
}

// SHORT
if(breakoutDown && trendShort && momentum < -0.003 && momentumVol){
    let entry = price
    let sl = entry + atrVal * 1.2
    let tp = entry - atrVal * 3.5

    let risk = Math.abs(entry - sl)
    let rr = Math.abs(tp - entry) / risk

    if(rr >= 1.2){
        return {
            side: "SHORT",
            entry,
            sl,
            tp,
            rr,
            atr: atrVal,
            type: "MOMENTUM"
        }
    }
}

    // ===== RETEST + BREAK MẠNH =====
    let retestLong = Math.abs(price - prevHigh) / price < 0.003
    let retestShort = Math.abs(price - prevLow) / price < 0.003

    let strongBreakUp = (price - prevHigh) / price > 0.0015
    let strongBreakDown = (prevLow - price) / price > 0.0015

    if(breakoutUp && !strongBreakUp && !momentumVol) return null
    if(breakoutDown && !strongBreakDown && !momentumVol) return null
    // ===== ANTI FAKE BREAK =====
    let lastRange = highs.at(-1) - lows.at(-1)
    if(lastRange > atrVal * 2.5) return null

    // ===== KHÔNG ĐU QUÁ XA =====
    let distance = Math.abs(price - (breakoutUp ? prevHigh : prevLow)) / price
    if(distance > 0.015) return null // nới

    // ===== CONFIRM CLOSE =====
    let lastClose = closes.at(-1)

    //if(breakoutUp && lastClose <= prevHigh) return null
    //if(breakoutDown && lastClose >= prevLow) return null

    // ===== ENTRY =====
    let side = breakoutUp ? "LONG" : "SHORT"
    let entry = price

    // ===== SL =====
    let swingLow = Math.min(...lows.slice(-10))
    let swingHigh = Math.max(...highs.slice(-10))

    let sl = breakoutUp
        ? swingLow - atrVal * 0.2
        : swingHigh + atrVal * 0.2

    let risk = Math.abs(entry - sl)
    if(risk === 0) return null

    // ===== TP =====
    let range25 = Math.max(...highs.slice(-25)) - Math.min(...lows.slice(-25))

    let tp = breakoutUp
        ? entry + range25 * 1.0
        : entry - range25 * 1.0

    let rr = Math.abs(tp - entry) / risk
    if(rr < RR_THRESHOLD) return null

    return {
        side,
        entry,
        sl,
        tp,
        rr,
        atr: atrVal
    }
}

// ================= SCANNER =================
async function scanner(){

    if(isScanning){
        console.log("⛔ Skip scan trùng")
        return
    }

    isScanning = true

    try{
        console.log("🚀 SCAN BTC...")
        if(Date.now() - lastSignalTime < 600000){ // 10 phút
    console.log("⏳ Đợi cooldown...")
    isScanning = false
    return
}

        // ===== CHỈ 1 LỆNH BTC =====
        if(activeTrades.length > 0){
            console.log("⛔ Đang có lệnh")
            isScanning = false
            return
        }

        let data15 = await getData("BTCUSDT","15m",300)
        let data1h = await getData("BTCUSDT","1h",200)
        let data1m = null

for(let i=0;i<3;i++){
    data1m = await getData("BTCUSDT","1m",50)
    if(data1m) break
    await new Promise(r=>setTimeout(r,500))
}

if(!data1m){
    console.log("⚠️ 1m fail → dùng entry 15m")
    data1m = data15 // fallback
}

        if(!data15 || !data1h){
            console.log("❌ Data fail")
            isScanning = false
            return
        }

        let r = await coreLogic(data15, data1h)

        if(!r){
            console.log("❌ No signal BTC")
            return
        }
        
        // ======== ENTRY 1M ========
       if(r.type !== "MOMENTUM" && data1m){
    r.entry = getBetterEntry(r, data1m)
}
        // ======= filter tránh đu giá  =======
        let distance = Math.abs(r.entry - r.sl) / r.entry

// tránh entry quá xa
if(distance > 0.02){ // nới nhẹ
    console.log("❌ Entry quá xa")
    return
}

        // ===== RR CHECK =====
        let risk = Math.abs(r.entry - r.sl)
        if(!risk || risk === 0) return

        // ===== TELE =====
        let msg = `🔥 BTC SIGNAL

${r.side}
ENTRY: ${r.entry}
TP: ${r.tp}
SL: ${r.sl}
RR: ${r.rr.toFixed(2)}
`

        console.log(msg)
        let ok = await sendTelegram(msg)

if(ok){
    lastSignalTime = Date.now()
}else{
    console.log("❌ Không gửi được TELE")
}
        // ===== SAVE TRADE (RAM) =====
        let trade = {
            symbol: "BTCUSDT",
            side: r.side,
            entry: r.entry,
            tp: r.tp,
            sl: r.sl,
            time: Date.now(),
            beMoved: false
        }

        activeTrades.push(trade)

    }catch(e){
        console.log("❌ scanner error:", e.message)
    }finally{
        isScanning = false
    }
}


// ================= CHECK TRADES =================
async function checkTrades(){

    if(activeTrades.length === 0) return

    let data = await getData("BTCUSDT","1m",2)
    if(!data) return

    let price = +data.at(-1)[4]

    for(let i = activeTrades.length -1; i>=0; i--){

        let t = activeTrades[i]
        let duration = Date.now() - t.time

        let win = false
        let done = false
        let exitPrice = price

        // ===== TIMEOUT 6H =====
        if(duration > 21600000){

            let pnl = t.side === "LONG"
                ? ((price - t.entry) / t.entry) * 100
                : ((t.entry - price) / t.entry) * 100

            let msg = `⏰ BTC TIMEOUT 6H
${t.side}

PnL: ${pnl.toFixed(2)}%
PRICE: ${price}`

            await sendTelegram(msg)
            activeTrades.splice(i,1)
    continue
        }

        // ===== BREAK EVEN =====
let risk = Math.abs(t.entry - t.sl)

let beTrigger = t.side === "LONG"
    ? t.entry + risk * 0.7
    : t.entry - risk * 0.7

if(!t.beMoved){
    if(
        (t.side === "LONG" && price >= beTrigger) ||
        (t.side === "SHORT" && price <= beTrigger)
    ){
        t.sl = t.entry
        t.beMoved = true

        await sendTelegram(`🔒 BE ACTIVATED
${t.side}
SL moved to: ${t.sl.toFixed(2)}`)
    }
}

// ===== TRAILING SL =====
if(t.beMoved){

    let trail = Math.abs(price - t.entry) * 0.5

    if(t.side === "LONG"){
        let newSL = price - trail

        if(newSL > t.sl){
            t.sl = newSL

            await sendTelegram(`📈 TRAILING SL
LONG
New SL: ${t.sl.toFixed(2)}
Price: ${price}`)
        }
    }

    if(t.side === "SHORT"){
        let newSL = price + trail

        if(newSL < t.sl){
            t.sl = newSL

            await sendTelegram(`📉 TRAILING SL
SHORT
New SL: ${t.sl.toFixed(2)}
Price: ${price}`)
        }
    }
}

        // ===== TP / SL =====
        if(!done){

            if(t.side === "LONG"){
                if(price >= t.tp){ win=true; done=true; exitPrice = t.tp }
                if(price <= t.sl){ done=true; exitPrice = t.sl }
            }

            if(t.side === "SHORT"){
                if(price <= t.tp){ win=true; done=true; exitPrice = t.tp }
                if(price >= t.sl){ done=true; exitPrice = t.sl }
            }

            if(done){

                let pnl = t.side === "LONG"
                    ? ((exitPrice - t.entry) / t.entry) * 100
                    : ((t.entry - exitPrice) / t.entry) * 100

                let msg = `📊 BTC RESULT
${t.side} ${win ? "✅ WIN" : "❌ LOSS"}

PnL: ${pnl.toFixed(2)}%
PRICE: ${price}`

                await sendTelegram(msg)
            }
        }

        // ===== XÓA LỆNH =====
        if(done){
            activeTrades.splice(i,1)
        }
    }
}
// ================= LOOP =================
setInterval(()=>scanner(),60000)
setInterval(()=>checkTrades(),60000)

        scanner()
