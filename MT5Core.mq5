#property strict
#property version "1.00"
#include "TradeExecution.mqh"

input bool EnableOrders=false;
input ulong MagicNumber=23102601;
input ulong DeviationPoints=10;
input int HealthIntervalSeconds=30;

CTradeExecution execution;

void ReportStatus()
{
   MqlTick tick;
   bool has_tick=SymbolInfoTick(_Symbol,tick);
   PrintFormat("MT5 CORE | connected=%s | login=%I64d | server=%s | symbol=%s | quote=%s | algo=%s | orders_enabled=%s | strategy=NONE",
      TerminalInfoInteger(TERMINAL_CONNECTED)?"yes":"no",
      AccountInfoInteger(ACCOUNT_LOGIN),AccountInfoString(ACCOUNT_SERVER),_Symbol,
      has_tick && tick.bid>0 && tick.ask>0?"available":"waiting",
      TerminalInfoInteger(TERMINAL_TRADE_ALLOWED) && MQLInfoInteger(MQL_TRADE_ALLOWED)?"on":"off",
      EnableOrders?"yes":"no");
}

int OnInit()
{
   if(HealthIntervalSeconds<1) return INIT_PARAMETERS_INCORRECT;
   execution.Configure(EnableOrders,MagicNumber,DeviationPoints);
   if(!EventSetTimer(HealthIntervalSeconds))
   { Print("Cannot start health timer: ",GetLastError()); return INIT_FAILED; }
   Print("MT5 core started. No entry strategy is installed; no orders are sent automatically.");
   ReportStatus();
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason) { EventKillTimer(); }
void OnTimer() { ReportStatus(); }

void OnTick()
{
   // Entry/exit strategy will be added later. Intentionally no order calls.
}
