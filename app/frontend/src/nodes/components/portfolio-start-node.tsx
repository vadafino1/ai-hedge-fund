import { type NodeProps } from '@xyflow/react';
import { PieChart, Plus, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';
import { useNodeState } from '@/hooks/use-node-state';
import { type PortfolioStartNode } from '../types';
import { NodeShell } from './node-shell';
import { DateRangeFields, RunControls } from './start-node-run-controls';
import { useStartNodeFlowExecution } from './use-start-node-flow-execution';
import { useStartNodeRunDateRange } from './use-start-node-run-date-range';

interface PortfolioPosition {
  ticker: string;
  quantity: string;
  tradePrice: string;
}

export function PortfolioStartNode({
  data,
  selected,
  id,
  isConnectable,
}: NodeProps<PortfolioStartNode>) {
  // Use persistent state hooks
  const [positions, setPositions] = useNodeState<PortfolioPosition[]>(id, 'positions', [
    { ticker: '', quantity: '', tradePrice: '' },
  ]);
  const [initialCash, setInitialCash] = useNodeState(id, 'initialCash', '100000');
  const [runMode, setRunMode] = useNodeState(id, 'runMode', 'single');
  const {
    startDate,
    endDate,
    defaultStartDate,
    defaultEndDate,
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
  
  // Check if the portfolio analyzer can be run
  const canRunPortfolioAnalyzer = canRun && positions.length > 0 && positions.every(pos => pos.ticker.trim() !== '');
  
  // Add keyboard shortcut for Cmd+Enter / Ctrl+Enter to run portfolio analyzer
  useKeyboardShortcuts({
    shortcuts: [
      {
        key: 'Enter',
        ctrlKey: true,
        metaKey: true,
        callback: () => {
          if (canRunPortfolioAnalyzer) {
            handlePlay();
          }
        },
        preventDefault: true,
      },
    ],
  });

  
  const handlePositionChange = (index: number, field: keyof PortfolioPosition, value: string) => {
    const newPositions = [...positions];
    newPositions[index][field] = value;
    setPositions(newPositions);
  };

  const addPosition = () => {
    setPositions([...positions, { ticker: '', quantity: '', tradePrice: '' }]);
  };

  const removePosition = (index: number) => {
    const newPositions = positions.filter((_, i) => i !== index);
    setPositions(newPositions);
  };

  const handleInitialCashChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInitialCash(e.target.value);
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
    
    // Convert positions to the expected format for backend use
    const portfolioPositions = positions
      .filter(pos => pos.ticker.trim() !== '' && pos.quantity.trim() !== '' && pos.tradePrice.trim() !== '')
      .map(pos => ({
        ticker: pos.ticker.trim(),
        quantity: parseFloat(pos.quantity) || 0,
        trade_price: parseFloat(pos.tradePrice) || 0
      }));
    
    // For now, extract tickers for current API compatibility
    const tickerList = positions.map(pos => pos.ticker.trim()).filter(ticker => ticker !== '');
    
    // Check if we're in backtest mode
    if (runMode === 'backtest') {
      // Use the flow connection hook to run the backtest with selected dates
      runBacktest({
        tickers: tickerList,
        // Send the actual graph structure instead of just selected analysts
        graph_nodes,
        graph_edges,
        agent_models,
        start_date: startDate,
        end_date: endDate,
        initial_capital: parseFloat(initialCash) || 100000,
        margin_requirement: 0.0, // Default margin requirement
        model_name: undefined,
        model_provider: undefined,
        // Pass portfolio positions to backend
        portfolio_positions: portfolioPositions,
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
        start_date: defaultStartDate,
        end_date: defaultEndDate,
        initial_cash: parseFloat(initialCash) || 100000,
        // Pass portfolio positions to backend
        portfolio_positions: portfolioPositions,
      });
    }
  };

  return (
    <TooltipProvider>
      <NodeShell
        id={id}
        selected={selected}
        isConnectable={isConnectable}
        icon={<PieChart className="h-5 w-5" />}
        name={data.name || "Portfolio Analyzer"}
        description={data.description}
        hasLeftHandle={false}
        width="w-80"
      >
        <CardContent className="p-0">
          <div className="border-t border-border p-3">
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
                    type="number"
                    placeholder="100000"
                    value={initialCash}
                    onChange={handleInitialCashChange}
                    className="pl-8 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    step="0.01"
                    min="0"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <div className="text-subtitle text-primary flex items-center gap-1">
                  <Tooltip delayDuration={200}>
                    <TooltipTrigger asChild>
                      <span>Positions</span>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      Add your portfolio positions with ticker, quantity, and trade price
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="flex flex-col gap-2">
                  {positions.map((position, index) => {
                    return (
                    <div key={index} className="flex gap-2 items-center">
                      <Input
                        placeholder="Ticker"
                        value={position.ticker}
                        onChange={(e) => handlePositionChange(index, 'ticker', e.target.value)}
                        className="flex-1"
                      />
                      <Input
                        type="number"
                        placeholder="Quantity"
                        value={position.quantity}
                        onChange={(e) => handlePositionChange(index, 'quantity', e.target.value)}
                        className="w-20"
                        step="any"
                      />
                      <div className="relative flex-1">
                        <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground pointer-events-none">
                          $
                        </div>
                        <Input
                          type="number"
                          placeholder="Price"
                          value={position.tradePrice}
                          onChange={(e) => handlePositionChange(index, 'tradePrice', e.target.value)}
                          className="pl-8"
                          step="0.01"
                          min="0"
                        />
                      </div>
                      {positions.length > 1 && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => removePosition(index)}
                          className="flex-shrink-0 h-8 w-4 text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    );
                  })}
                  <Button
                    onClick={addPosition}
                    className="w-full mt-2 transition-all duration-200 hover:bg-primary hover:text-primary-foreground active:scale-95"
                    size="sm"
                    variant="secondary"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Position
                  </Button>
                </div>
              </div>
              <RunControls
                runMode={runMode}
                onRunModeChange={setRunMode}
                showAsProcessing={showAsProcessing}
                canRun={canRunPortfolioAnalyzer}
                onStop={handleStop}
                onPlay={handlePlay}
                fallbackLabel="Single Analysis"
              />
              {runMode === 'backtest' && (
                <DateRangeFields
                  startDate={startDate}
                  endDate={endDate}
                  onStartDateChange={handleStartDateChange}
                  onEndDateChange={handleEndDateChange}
                />
              )}
            </div>
          </div>
        </CardContent>
      </NodeShell>
    </TooltipProvider>
  );
}
