import { type ChangeEvent, useState } from 'react';
import { ChevronDown, Play, Square } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn, formatKeyboardShortcut } from '@/lib/utils';

const startNodeRunModes = [
  { value: 'single', label: 'Single Run' },
  { value: 'backtest', label: 'Backtest' },
];

interface RunControlsProps {
  runMode: string;
  onRunModeChange: (runMode: string) => void;
  showAsProcessing: boolean;
  canRun: boolean;
  onPlay: () => void;
  onStop: () => void;
  fallbackLabel?: string;
}

export function RunControls({
  runMode,
  onRunModeChange,
  showAsProcessing,
  canRun,
  onPlay,
  onStop,
  fallbackLabel = 'Single Run',
}: RunControlsProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <div className="text-subtitle text-primary flex items-center gap-1">
        Run
      </div>
      <div className="flex gap-2">
        <RunModeSelect
          runMode={runMode}
          onRunModeChange={onRunModeChange}
          open={open}
          onOpenChange={setOpen}
          fallbackLabel={fallbackLabel}
        />
        <RunActionButton
          showAsProcessing={showAsProcessing}
          canRun={canRun}
          onPlay={onPlay}
          onStop={onStop}
        />
      </div>
    </div>
  );
}

interface RunModeSelectProps {
  runMode: string;
  onRunModeChange: (runMode: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fallbackLabel: string;
}

function RunModeSelect({
  runMode,
  onRunModeChange,
  open,
  onOpenChange,
  fallbackLabel,
}: RunModeSelectProps) {
  const selectedMode = startNodeRunModes.find((mode) => mode.value === runMode);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="flex-1 justify-between h-10 px-3 py-2 bg-node border border-border hover:bg-accent"
        >
          <span className="text-subtitle">{selectedMode?.label ?? fallbackLabel}</span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0 bg-node border border-border shadow-lg">
        <Command className="bg-node">
          <CommandList className="bg-node">
            <CommandEmpty>No run mode found.</CommandEmpty>
            <CommandGroup>
              {startNodeRunModes.map((mode) => (
                <CommandItem
                  key={mode.value}
                  value={mode.value}
                  className={cn('cursor-pointer bg-node hover:bg-accent', runMode === mode.value)}
                  onSelect={(currentValue) => {
                    onRunModeChange(currentValue);
                    onOpenChange(false);
                  }}
                >
                  {mode.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

interface RunActionButtonProps {
  showAsProcessing: boolean;
  canRun: boolean;
  onPlay: () => void;
  onStop: () => void;
}

function RunActionButton({ showAsProcessing, canRun, onPlay, onStop }: RunActionButtonProps) {
  const action = getRunActionButtonState({ showAsProcessing, onPlay, onStop });
  const Icon = action.icon;

  return (
    <Button
      size="icon"
      variant="secondary"
      className="flex-shrink-0 transition-all duration-200 hover:bg-primary hover:text-primary-foreground active:scale-95"
      title={action.title}
      onClick={action.onClick}
      disabled={!canRun && action.requiresRunnableState}
    >
      <Icon className="h-3.5 w-3.5" />
    </Button>
  );
}

interface RunActionButtonStateParams {
  showAsProcessing: boolean;
  onPlay: () => void;
  onStop: () => void;
}

function getRunActionButtonState({ showAsProcessing, onPlay, onStop }: RunActionButtonStateParams) {
  if (showAsProcessing) {
    return {
      title: 'Stop',
      onClick: onStop,
      icon: Square,
      requiresRunnableState: false,
    };
  }

  return {
    title: `Run (${formatKeyboardShortcut('↵')})`,
    onClick: onPlay,
    icon: Play,
    requiresRunnableState: true,
  };
}

interface DateRangeFieldsProps {
  startDate: string;
  endDate: string;
  onStartDateChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onEndDateChange: (event: ChangeEvent<HTMLInputElement>) => void;
  order?: 'start-first' | 'end-first';
}

export function DateRangeFields({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  order = 'start-first',
}: DateRangeFieldsProps) {
  const fields = [
    {
      key: 'start',
      label: 'Start Date',
      value: startDate,
      onChange: onStartDateChange,
    },
    {
      key: 'end',
      label: 'End Date',
      value: endDate,
      onChange: onEndDateChange,
    },
  ];
  const orderedFields = order === 'end-first' ? [fields[1], fields[0]] : fields;

  return (
    <div className="flex flex-col gap-4">
      {orderedFields.map((field) => (
        <div key={field.key} className="flex flex-col gap-2">
          <div className="text-subtitle text-primary flex items-center gap-1">
            {field.label}
          </div>
          <Input
            type="date"
            value={field.value}
            onChange={field.onChange}
          />
        </div>
      ))}
    </div>
  );
}
