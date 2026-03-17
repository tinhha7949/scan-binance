const express = require("express");
const fetch = require("node-fetch");

const app = express();

let signals = [];
let lastUpdate = "";

// ================= API =================
app.get("/api", (req, res) => {
  res.json({ signals, lastUpdate });
});

// scan thủ công
app.get("/scan", async (req, res) => {
  await scan();
  res.send("ok");
});

// ================= UI =================
app.get("/", (req, res) => {
  res.send(`
  <html>
  <head>
    <title>Future Scanner Pro</title>

    <style>
      body {
        margin: 0;
        font-family: Arial;
        background: #0f172a;
        color: #e2e8f0;
      }

      .header {
        background: #020617;
        padding: 15px 20px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid #1e293b;
      }

      .title {
        font-size: 20px;
        color: #38bdf8;
      }

      .btn {
        background: #38bdf8;
        border: none;
        padding: 8px 16px;
        border-radius: 6px;
        cursor: pointer;
        font-weight: bold;
      }

      .btn:hover {
        background: #0ea5e9;
      }

      .container {
        padding: 20px;
      }

      .status {
        margin-bottom: 10px;
        color: #94a3b8;
      }

      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill,minmax(250px,1fr));
        gap: 15px;
      }

      .card {
        background: #020617;
        padding: 15px;
        border-radius: 10px;
        border: 1px solid #1e293b;
      }

      .coin {
        font-size: 18px;
        font-weight: bold;
      }

      .long { color: #22c55e; }
      .short { color: #ef4444; }

      .score {
        margin-top: 5px;
        font-size: 14px;
        color: #94a3b8;
      }

    </style>
  </head>

  <body>

    <div class="header">
      <div class="title">🚀 Future Scanner</div>
      <button class="btn" onclick="scanNow()">Scan lại</button>
    </div>

    <div class="container">
      <div class="status" id="status">Ready...</div>
      <div class="status">Last update: <span id="time">...</span></div>

      <div class="grid" id="list"></div>
    </div>

    <script>
      async function load(){
        let res = await fetch("/api");
        let d = await res.json();

        document.getElementById("time").innerText = d.lastUpdate;

        let html = "";

        d.signals.forEach(c=>{
          html += \`
          <div class="card">
            <div class="coin">\${c.symbol}</div>
            <div class="\${c.side==="LONG"?"long":"short"}">\${c.side}</div>
            <div>Entry: \${c.price.toFixed(4)}</div>
            <div>TP: \${c.tp.toFixed(4)}</div>
            <div>SL: \${c.sl.toFixed(4)}</div>
            <div class="score">Score: \${c.score}</div>
          </div>
          \`;
        });

        document.getElementById("list").innerHTML = html;
        document.getElementById("status").innerText = "✅ Done";
      }

      async function scanNow(){
        document.getElementById("status").innerText = "⚡ Đang scan...";

        await fetch("/scan");

        await load();
      }

      load();
      setInterval(load, 5000);
    </script>

  </body>
  </html>
  `);
});

// ================= SERVER =================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server chạy cổng", PORT));

// ================= BOT =================
async function scan(){

  console.log("🚀 SCAN...");

  let coins = [
    "BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","XRPUSDT",
    "ADAUSDT","AVAXUSDT","DOGEUSDT","LINKUSDT","DOTUSDT"
  ];

  function ema(arr, p){
    let k=2/(p+1);
    let e=arr[0];
    for(let i=1;i<arr.length;i++){
      e=arr[i]*k+e*(1-k);
    }
    return e;
  }

  function rsi(arr,p=14){
    let g=0,l=0;
    for(let i=arr.length-p;i<arr.length;i++){
      let d=arr[i]-arr[i-1];
      if(d>=0) g+=d;
      else l-=d;
    }
    let rs=g/(l||1);
    return 100-(100/(1+rs));
  }

  async function getData(symbol){
    try{
      let url = \`https://fapi.binance.com/fapi/v1/klines?symbol=\${symbol}&interval=15m&limit=200\`;
      let res = await fetch(url);
      if(!res.ok) return null;
      return await res.json();
    }catch{
      return null;
    }
  }

  let results=[];

  for(let symbol of coins){

    let data=await getData(symbol);
    if(!data) continue;

    let closes=data.map(x=>parseFloat(x[4]));
    let price=closes.at(-1);

    let ema20=ema(closes.slice(-40),20);
    let ema50=ema(closes.slice(-80),50);

    let r=rsi(closes);

    let side=null;
    let score=0;

    if(ema20>ema50){
      side="LONG"; score+=60;
    }

    if(ema20<ema50){
      side="SHORT"; score+=60;
    }

    if(side==="LONG" && r>50) score+=20;
    if(side==="SHORT" && r<50) score+=20;

    if(score>=80){
      let tp = side==="LONG" ? price*1.05 : price*0.95;
      let sl = side==="LONG" ? price*0.985 : price*1.015;

      results.push({symbol,side,price,tp,sl,score});
    }
  }

  results.sort((a,b)=>b.score-a.score);

  signals = results.slice(0,10);
  lastUpdate = new Date().toLocaleTimeString();
}

// chạy auto
scan();
setInterval(scan, 300000);
