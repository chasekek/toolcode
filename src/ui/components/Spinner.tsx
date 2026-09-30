import {useEffect, useState} from 'react';
import {Text} from 'ink';
import {gradientColors, useTheme} from '../theme.js';

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

/**
 * Spinner, activity and elapsed time. A highlight sweeps across the label so
 * a long wait between tokens still looks alive.
 */
export function ActivityIndicator({label, startedAt}: Props) {
	const {symbols, colors} = useTheme();
	const tick = useTick(80);
	const text = `${label}${symbols.ellipsis}`;
	const chars = [...text];
	// The sweep runs a little past both ends so it pauses between passes.
	const sweep = (Math.floor(tick / 1.5) % (chars.length + 8)) - 4;
	const [base, glow] = gradientColors([colors.accent, colors.selectionText], 2);
	const seconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
	const elapsed = seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;

	return (
		<Text wrap="truncate-end">
			<Text color={colors.accent}>{symbols.spinner[tick % symbols.spinner.length]} </Text>
			{chars.map((char, i) => (
				<Text key={i} color={Math.abs(i - sweep) <= 1 ? glow : base}>
					{char}
				</Text>
			))}
			<Text color={colors.muted}> {elapsed}</Text>
		</Text>
	);
}
