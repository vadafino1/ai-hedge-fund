import { type NodeProps } from '@xyflow/react';
import { ChartLine } from 'lucide-react';

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';
import { useNodeState } from '@/hooks/use-node-state';
import { type StockAnalyzerNode } from '../types';
import { NodeShell } from './node-shell';
import { DateRangeFields, RunControls } from './start-node-run-controls';
import { useStartNodeFlowExecution } from './use-start-node-flow-execution';
import { useStartNodeRunDateRange } from './use-start-node-run-date-range';

export function StockAnalyzerNode({
  data,
  selected,
  id,
  isConnectable,
}: NodeProps<StockAnalyzerNode>) {
  // Use persistent state hooks
  const [tickers, setTickers] = useNodeState(id, 'tickers', 'AAPL,NVDA,TSLA');
  const [runMode, setRunMode] = useNodeState(id, 'runMode', 'single');
  const [initialCash, setInitialCash] = useNodeState(id, 'initialCash', '100000');
  const {
    startDate,
    endDate,
    handleStartDateChange,
    handleEndDateChange,
  } = useStartNodeRunDateRange(id);
  
  const {
    canRun,
    runFlow,
    runBacktest,
    stopFlow,
    openBacktestOutput,
    prepareRunPayload,
    showAsProcessing,
  } = useStartNodeFlowExecution(id);
  
  // Check if the hedge fund can be run
  const canRunHedgeFund = canRun && tickers.trim() !== '';
  
  // Add keyboard shortcut for Cmd+Enter / Ctrl+Enter to run hedge fund
  useKeyboardShortcuts({
    shortcuts: [
      {
        key: 'Enter',
        ctrlKey: true,
        metaKey: true,
        callback: () => {
          if (canRunHedgeFund) {
            handlePlay();
          }
        },
        preventDefault: true,
      },
    ],
  });

  
  const handleTickersChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTickers(e.target.value);
  };

  const handleInitialCashChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Remove non-numeric characters except decimal point
    const numericValue = e.target.value.replace(/[^0-9.]/g, '');
    setInitialCash(numericValue);
  };

  // Format the display value with commas
  const formatCurrency = (value: string) => {
    if (!value) return '';
    const num = parseFloat(value);
    if (isNaN(num)) return value;
    return num.toLocaleString('en-US');
  };

  const handleStop = () => {
    stopFlow();
  };

  const handlePlay = () => {
    // Expand bottom panel and set to output tab if backtest
    if (runMode === 'backtest') {
      openBacktestOutput();
    }
    
    const { graph_nodes, graph_edges, agent_models } = prepareRunPayload();
    
    // Convert tickers to array    
    const tickerList = tickers.split(',').map(t => t.trim());
    
    // Check if we're in backtest mode
    if (runMode === 'backtest') {
      // Use the flow connection hook to run the backtest with selected dates
      runBacktest({
        tickers: tickerList,
        // Send the actual graph structure instead of just selected agents
        graph_nodes,
        graph_edges,
        agent_models,
        start_date: startDate,
        end_date: endDate,
        initial_capital: parseFloat(initialCash) || 100000,
        margin_requirement: 0.0, // Default margin requirement
        model_name: undefined,
        model_provider: undefined,
      });
    } else {
      // Use the regular hedge fund API for single run
      runFlow({
        tickers: tickerList,
        // Send the actual graph structure instead of just selected agents
        graph_nodes,
        graph_edges,
        agent_models,
        // No global model - each agent uses its own model or system default
        model_name: undefined,
        model_provider: undefined,
        start_date: startDate,
        end_date: endDate,
      });
    }
  };

  return (
    <TooltipProvider>
      <NodeShell
        id={id}
        selected={selected}
        isConnectable={isConnectable}
        icon={<ChartLine className="h-5 w-5" />}
        name={data.name || "Stock Analyzer"}
        description={data.description}
        hasLeftHandle={false}
      >
        <CardContent className="p-0">
          <div className="border-t border-border p-3">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <div className="text-subtitle text-primary flex items-center gap-1">
                  <Tooltip delayDuration={200}>
                    <TooltipTrigger asChild>
                      <span>Tickers</span>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      You can add multiple tickers using commas (AAPL,NVDA,TSLA)
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Input
                  placeholder="Enter tickers"
                  value={tickers}
                  onChange={handleTickersChange}
                />
              </div>
              <RunControls
                runMode={runMode}
                onRunModeChange={setRunMode}
                showAsProcessing={showAsProcessing}
                canRun={canRunHedgeFund}
                onStop={handleStop}
                onPlay={handlePlay}
              />
              {runMode === 'backtest' && (
                <Accordion type="single" collapsible>
                  <AccordionItem value="advanced" className="border-none">
                    <AccordionTrigger className="!text-subtitle text-primary">
                      Advanced
                    </AccordionTrigger>
                    <AccordionContent className="pt-2">
                      <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-2">
                          <div className="text-subtitle text-primary flex items-center gap-1">
                            Available Cash
                          </div>
                          <div className="relative flex-1">
                            <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground pointer-events-none">
                              $
                            </div>
                            <Input
                              type="text"
                              placeholder="100,000"
                              value={formatCurrency(initialCash)}
                              onChange={handleInitialCashChange}
                              className="pl-8 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                          </div>
                        </div>
                        <DateRangeFields
                          startDate={startDate}
                          endDate={endDate}
                          onStartDateChange={handleStartDateChange}
                          onEndDateChange={handleEndDateChange}
                        />
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              )}
              {runMode === 'single' && (
                <Accordion type="single" collapsible>
                  <AccordionItem value="advanced" className="border-none">
                    <AccordionTrigger className="!text-subtitle text-primary">
                      Advanced
                    </AccordionTrigger>
                    <AccordionContent className="pt-2">
                      <DateRangeFields
                        startDate={startDate}
                        endDate={endDate}
                        onStartDateChange={handleStartDateChange}
                        onEndDateChange={handleEndDateChange}
                        order="end-first"
                      />
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              )}
            </div>
          </div>
        </CardContent>
      </NodeShell>
    </TooltipProvider>
  );
}
