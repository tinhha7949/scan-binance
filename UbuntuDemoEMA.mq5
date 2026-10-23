#property strict
#property version "1.10"
#include "BotInputs.mqh"
#include "StrategyEMA.mqh"
#include "OrderExecution.mqh"

CEMAStrategy strategy;
COrderExecution execution;
datetime lastbar=0;

int OnInit()
{
   if(FastEMA<1 || SlowEMA<=FastEMA || Lots<=0 || StopLossPoints<=0 ||
      TakeProfitPoints<=0 || MaxSpreadPoints<=0) return INIT_PARAMETERS_INCORRECT;
   if(AccountInfoInteger(ACCOUNT_TRADE_MODE)!=ACCOUNT_TRADE_MODE_DEMO)
   { Print("Demo account required; EA stopped."); return INIT_FAILED; }
   if(!strategy.Init(_Symbol,_Period,FastEMA,SlowEMA) || !execution.Init(_Symbol,Magic))
      return INIT_FAILED;
   lastbar=iTime(_Symbol,_Period,0);
   Print("Demo EMA ready. EnableDemoOrders=",EnableDemoOrders);
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason) { strategy.Release(); }

void OnTick()
{
   if(AccountInfoInteger(ACCOUNT_TRADE_MODE)!=ACCOUNT_TRADE_MODE_DEMO) return;
   datetime bar=iTime(_Symbol,_Period,0);
   if(bar==0 || bar==lastbar) return;
   if(lastbar==0) { lastbar=bar; return; }
   int signal=0;
   if(!strategy.Read(signal)) return;
   lastbar=bar;
   if(signal==0) return;
   Print("Closed-candle EMA signal: ",signal==1?"BUY":"SELL");
   execution.Execute(signal,_Symbol,EnableDemoOrders,Lots,
                     StopLossPoints,TakeProfitPoints,MaxSpreadPoints);
}
