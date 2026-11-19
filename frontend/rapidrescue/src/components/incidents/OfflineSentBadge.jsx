import { getOfflineDelay } from '../../utils/offlineSos';
import Icon from '../common/Icon';
import styles from './OfflineSentBadge.module.css';

const FULL = { dateStyle: 'medium', timeStyle: 'short' };

/**
 * Shown on a help request that the phone could not send right away (no signal) and that
 * arrived later. Renders nothing for a normal request.
 */
export default function OfflineSentBadge({ incident }) {
  const delay = getOfflineDelay(incident);
  if (!delay) return null;
  const title =
    `The reporter had no signal. HELP was pressed at ${delay.pressedAt.toLocaleString('en-PH', FULL)} ` +
    `and reached the server at ${delay.receivedAt.toLocaleString('en-PH', FULL)} (${delay.label} later).`;
  return (
    <span className={styles.badge} title={title}>
      <Icon name="wifi_off" size={13} />
      Sent offline · {delay.label} delay
    </span>
  );
}
