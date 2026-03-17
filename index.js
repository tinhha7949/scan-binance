const express = require("express");
const fetch = require("node-fetch");

const app = express();

let signals = [];
let lastUpdate = "";
let cacheData = {}; // 🔥 lưu data tránh lệch

// ===== COINS =====
const coins = [
"BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","XRPUSDT",
"ADAUSDT","AVAXUSDT","DOGEUSDT","LINKUSDT","DOTUSDT",
"MATICUSDT","LTCUSDT","TRXUSDT","ATOMUSDT","NEARUSDT",
"INJUSDT","APTUSDT","OPUSDT","ARBUSDT","SUIUSDT",
"SEIUSDT","TIAUSDT","FILUSDT","AAVEUSDT","RNDRUSDT",
"GALAUSDT","DYDXUSDT","ETCUSDT","ICPUSDT","THETAUSDT",
"KASUSDT","STXUSDT","IMXUSDT","FLOWUSDT","EGLDUSDT",
"XTZUSDT","KAVAUSDT","CRVUSDT","SANDUSDT","MANAUSDT",
"APEUSDT","LDOUSDT","RUNEUSDT","COMPUSDT","SNXUSDT",
"CHZUSDT","ZILUSDT","1INCHUSDT","BATUSDT","ENSUSDT"
];

// ===== UI giữ nguyên của bạn =====
app.get("/", (req, res) => {
  res.send("OK - dùng UI cũ của bạn");
});

// ===== API =====
app.get("/api", (req, res) => {
  res.json({ signals, lastUpdate });
});

app.get("/scan", async (req, res) => {
  await scan();
  res.send("ok");
});

// ===== SERVER =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("RUNNING PORT", PORT));

// ===== BOT =====
async function scan(){

  console.log("🚀 SCAN...");

  function ema(arr,p){
    let k=2/(p+1),e=arr[0];
    for(let i=1;i<arr.length;i++) e=arr[i]*k+e*(1-k);
    return e;
  }

  function rsi(arr,p=14){
    let g=0,l=0;
    for(let i=arr.length-p;i<arr.length;i++){
      let d=arr[i]-arr[i-1];
      if(d>=0) g+=d; else l-=d;
    }
    let rs=g/(l||1);
    return 100-(100/(1+rs));
  }

  async function getData(symbol){
    try{
      // 🔥 dùng cache nếu có
      if(cacheData[symbol]) return cacheData[symbol];

      let url = "https://fapi.binance.com/fapi/v1/klines?symbol="+symbol+"&interval=15m&limit=200";

      for(let i=0;i<3;i++){ // retry 3 lần
        let res = await fetch(url);

        if(!res.ok) continue;

        let data = await res.json();

        if(Array.isArray(data) && data.length > 100){

          // lọc data sạch
          data = data.filter(x => x && x[4]);

          cacheData[symbol] = data; // lưu lại
          return data;
        }
      }

      console.log("❌ FAIL:", symbol);
      return null;

    }catch{
      return null;
    }
  }

  let results=[];

  // reset cache mỗi lần scan để đồng bộ cùng thời điểm
  cacheData = {};

  for(let symbol of coins){

    console.log("Scan:", symbol);

    let data = await getData(symbol);
    if(!data) continue;

    let closes = data.map(x=>parseFloat(x[4]));
    if(closes.length < 50) continue;

    let price = closes[closes.length-1];

    let e20 = ema(closes.slice(-40),20);
    let e50 = ema(closes.slice(-80),50);

    let r = rsi(closes);

    let side=null,score=0;

    if(e20>e50){side="LONG";score+=60}
    if(e20<e50){side="SHORT";score+=60}

    if(side==="LONG" && r>50) score+=20;
    if(side==="SHORT" && r<50) score+=20;

    if(score >= 80){
      let tp = side==="LONG"?price*1.05:price*0.95;
      let sl = side==="LONG"?price*0.985:price*1.015;

      results.push({symbol,side,price,tp,sl,score});
    }else{
      console.log(symbol,"REJECT",score);
    }
  }

  results.sort((a,b)=>b.score-a.score);

  signals = results;
  lastUpdate = new Date().toLocaleTimeString();

  console.log("✅ DONE:", signals.length);
}

// chạy auto
scan();
setInterval(scan,300000);
