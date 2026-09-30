import {Box, Text} from 'ink';
import {useTheme} from '../theme.js';

/** Renders `**bold**` and `inline code` spans inside one line. */
function Inline({text}: {text: string}) {
	const {colors} = useTheme();
	const tokens = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
	return (
		<Text>
			{tokens.map((token, i) => {
				if (token.startsWith('**') && token.endsWith('**') && token.length > 4) {
					return (
						<Text key={i} bold>
							{token.slice(2, -2)}
						</Text>
					);
				}
				if (token.startsWith('`') && token.endsWith('`') && token.length > 2) {
					return (
						<Text key={i} color={colors.primary}>
							{token.slice(1, -1)}
						</Text>
					);
				}
				return token;
			})}
		</Text>
	);
}

/**
 * Small Markdown subset tuned for terminal output: headings, bullet and
 * numbered lists, fenced code, bold and inline code.
 */
export function Markdown({text}: {text: string}) {
	const {colors, symbols} = useTheme();
	const lines = text.replace(/\n{3,}/g, '\n\n').replace(/\n+$/, '').split('\n');
	let inFence = false;

	return (
		<Box flexDirection="column">
			{lines.map((line, i) => {
				if (/^\s*```/.test(line)) {
					inFence = !inFence;
					return null;
				}
				if (inFence) {
					return (
						<Text key={i}>
							<Text color={colors.muted}>{symbols.bar} </Text>
							{line}
						</Text>
					);
				}
				if (line.trim() === '') return <Text key={i}> </Text>;

				const heading = /^#{1,6}\s+(.*)$/.exec(line);
				if (heading) {
					return (
						<Text key={i} bold color={colors.primary}>
							{heading[1]}
						</Text>
					);
				}

				const bullet = /^(\s*)[-*]\s+(.*)$/.exec(line);
				if (bullet) {
					return (
						<Box key={i} paddingLeft={bullet[1]!.length}>
							<Box width={2} flexShrink={0}>
								<Text color={colors.muted}>{symbols.listBullet}</Text>
							</Box>
							<Inline text={bullet[2]!} />
						</Box>
					);
				}

				const numbered = /^(\s*)(\d+[.)])\s+(.*)$/.exec(line);
				if (numbered) {
					return (
						<Box key={i} paddingLeft={numbered[1]!.length}>
							<Box width={numbered[2]!.length + 1} flexShrink={0}>
								<Text color={colors.muted}>{numbered[2]}</Text>
							</Box>
							<Inline text={numbered[3]!} />
						</Box>
					);
				}

				return <Inline key={i} text={line} />;
			})}
		</Box>
	);
}
