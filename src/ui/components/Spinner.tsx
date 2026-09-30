import {useEffect, useState} from 'react';
import {Text} from 'ink';
import {useTheme} from '../theme.js';

/** Advances every `ms` while mounted; shared by all animated indicators. */
export function useTick(ms: number): number {
	const [tick, setTick] = useState(0);
	useEffect(() => {
		const timer = setInterval(() => setTick(t => t + 1), ms);
		return () => clearInterval(timer);
	}, [ms]);
	return tick;
}

export function SpinnerIcon({color}: {color?: string}) {
	const {symbols, colors} = useTheme();
	const tick = useTick(80);
	return <Text color={color ?? colors.primary}>{symbols.spinner[tick % symbols.spinner.length]}</Text>;
}

interface Props {
	label: string;
	startedAt: number;
}

/** Status line under a streaming response: spinner, activity, elapsed time. */
export function ActivityIndicator({label, startedAt}: Props) {
	const {symbols, colors} = useTheme();
	const tick = useTick(80);
	const seconds = Math.floor((Date.now() - startedAt) / 1000);
	// Gentle pulse on the ellipsis so the line feels alive between tokens.
	const dots = symbols.ellipsis === '…' ? '…' : '.'.repeat((Math.floor(tick / 4) % 3) + 1);

	return (
		<Text wrap="truncate-end">
			<Text color={colors.accent}>{symbols.spinner[tick % symbols.spinner.length]} </Text>
			<Text color={colors.accent}>
				{label}
				{dots}
			</Text>
			<Text color={colors.muted}>
				{' '}
				({seconds}s {symbols.dot} esc to interrupt)
			</Text>
		</Text>
	);
}
