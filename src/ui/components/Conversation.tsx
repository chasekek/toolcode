import {Static} from 'ink';
import type {Message} from '../../core/types.js';
import {Header} from './Header.js';
import {MessageView} from './MessageView.js';

type Item = {id: '__header'} | Message;

interface Props {
	history: Message[];
	live: Message[];
	width: number;
	expandTools: boolean;
	/** Changing this re-prints the static transcript (after a screen clear). */
	epoch: number;
}

/**
 * Finished turns are written once through <Static> so long sessions stay
 * cheap to render; only the current turn is redrawn while it streams.
 */
export function Conversation({history, live, width, expandTools, epoch}: Props) {
	const items: Item[] = [{id: '__header'}, ...history];
	return (
		<>
			<Static key={epoch} items={items}>
				{item =>
					item.id === '__header' ? (
						<Header key="__header" cwd={process.cwd()} width={width} />
					) : (
						<MessageView key={item.id} message={item as Message} expandTools={false} />
					)
				}
			</Static>
			{live.map(m => (
				<MessageView key={m.id} message={m} expandTools={expandTools} />
			))}
		</>
	);
}
