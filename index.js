const express = require("express");
const fetch = require("node-fetch");

const app = express();

let signals = [];
let lastUpdate = "";

// ===== FULL 50 COIN =====
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

// ===== API =====
app.get("/api", (req, res) => {
  res.json({ signals, lastUpdate });
});

app.get("/scan", async (req, res) => {
  await scan();
  res.send("ok");
});

// ===== UI =====
app.get("/", (req, res) => {
  res.send(`
  <html>
  <head>
    <title>Future Scanner</title>

    <style>
      body{
        background:#0b1220;
        color:#e5e7eb;
        font-family:Arial;
        padding:20px;
      }

      h1{
        color:#22c55e;
      }

      button{
        padding:10px 15px;
        background:#22c55e;
        border:none;
        border-radius:8px;
        cursor:pointer;
        font-weight:bold;
      }

      button:hover{
        background:#16a34a;
      }

      .top{
        display:flex;
        justify-content:space-between;
        align-items:center;
        margin-bottom:15px;
      }

      .card{
        background:#111827;
        padding:15px;
        margin-bottom:10px;
        border-radius:10px;
        border-left:5px solid #22c55e;
      }

      .short{
        border-left:5px solid #ef4444;
      }

      .symbol{
        font-size:18px;
        font-weight:bold;
      }

      .long{
        color:#22c55e;
        font-weight:bold;
      }

      .short-text{
        color:#ef4444;
        font-weight:bold;
      }

      .loading{
        color:#9ca3af;
        font-style:italic;
      }

    </style>
  </head>

  <body>

    <div class="top">
      <h1>🚀 Future Scanner</h1>
      <button onclick="scanNow()">🔄 Scan</button>
    </div>

    <div>⏱ Last update: <span id="time">...</span></div>
    <br>

    <div id="list" class="loading">Đang load dữ liệu...</div>

    <script>

    async function load(){
      try{
        let res = await fetch("/api");
        let d = await res.json();

        document.getElementById("time").innerText = d.lastUpdate || "...";

        let html = "";

        if(d.signals.length === 0){
          html = "<div class='loading'>❌ Không có kèo phù hợp</div>";
        }

        d.signals.forEach(c=>{
          html += \`
            <div class="card \${c.side==="SHORT"?"short":""}">
              <div class="symbol">\${c.symbol}</div>
              <div class="\${c.side==="LONG"?"long":"short-text"}">\${c.side}</div>
              <div>Entry: \${c.price.toFixed(4)}</div>
              <div>TP: \${c.tp.toFixed(4)}</div>
              <div>SL: \${c.sl.toFixed(4)}</div>
              <div>Score: \${c.score}</div>
            </div>
          \`;
        });

        document.getElementById("list").innerHTML = html;

      }catch(e){
        document.getElementById("list").innerHTML = "❌ Lỗi load dữ liệu";
      }
    }

    async function scanNow(){
      document.getElementById("list").innerHTML = "⏳ Đang scan...";
      await fetch("/scan");
      load();
    }

    load();
    setInterval(load,5000);

    </script>

  </body>
  </html>
  `);
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
      let url = "https://fapi.binance.com/fapi/v1/klines?symbol="+symbol+"&interval=15m&limit=200";

      let res = await fetch(url);
      if(!res.ok) return null;

      let data = await res.json();

      if(!Array.isArray(data)) return null;
      if(data.length === 0) return null;

      return data;

    }catch{
      return null;
    }
  }

  let results=[];

  for(let symbol of coins){

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

    if(score>=80){
      let tp = side==="LONG"?price*1.05:price*0.95;
      let sl = side==="LONG"?price*0.985:price*1.015;

      results.push({symbol,side,price,tp,sl,score});
    }
  }

  results.sort((a,b)=>b.score-a.score);

  signals = results.slice(0,10);
  lastUpdate = new Date().toLocaleTimeString();

  console.log("✅ DONE:", signals.length);
}

// chạy auto
scan();
setInterval(scan,300000);
