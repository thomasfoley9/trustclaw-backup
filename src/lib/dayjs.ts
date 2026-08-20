// Shared dayjs instance for CLIENT code - import from here, never from "dayjs"
// directly, so plugins (relativeTime for .fromNow()) are registered exactly
// once. Server code keeps moment/moment-timezone (see CLAUDE.md, Date & Time).
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

export default dayjs;
