/**
 * The multiplayer hub's protocol (M2): what the client and the server (`packages/server`) agree
 * on. One Colyseus room per class code runs the hub sim as the authority; clients send commands
 * and draw the snapshots it broadcasts.
 */

/** The room type every class joins, matched by class code. */
export const HUB_ROOM = 'hub';

/** A class code: 4 to 8 capital letters and digits (the room key). */
export const CLASS_CODE_PATTERN = /^[A-Z0-9]{4,8}$/;
/** `?class=<code>` joins that class's hub online instead of playing offline. */
export const URL_PARAM_CLASS = 'class';
/** `?name=<preset name>` skips the name choice (tools and tests). */
export const URL_PARAM_NAME = 'name';

/** At most this many players in one class hub (a class of about 30, plus a teacher and a spare). */
export const HUB_MAX_PLAYERS = 40;
/** A dropped connection may come back within this long and keep its bean (s). */
export const HUB_RECONNECT_S = 20;
/** Snapshots per second the server broadcasts (it steps the sim at 60 Hz). */
export const HUB_SNAPSHOT_HZ = 15;

/** Client → server: one hub command for the sender's bean (the server adds the player id). */
export const MSG_COMMAND = 'cmd';
/** Server → client, once on joining: who you are and the layout. */
export const MSG_WELCOME = 'welcome';
/** Server → everyone: the players (names and looks), whenever it changes. */
export const MSG_ROSTER = 'roster';
/** Server → everyone: the hub's state, HUB_SNAPSHOT_HZ times a second. */
export const MSG_SNAPSHOT = 'snap';

/** What a client sends when it joins. */
export interface HubJoinOptions {
  classCode: string;
  /** One of PRESET_NAMES (D27). */
  name: string;
  /** The look as its URL value (`lookToString`), e.g. `blue,spots,bow,glasses`. */
  look: string;
  /** Coming back from this region: the bean appears in front of its portal. */
  from?: string;
}

export interface RosterEntry {
  /** The bean's id in the sim (the connection's session id). */
  id: string;
  name: string;
  look: string;
}

export interface HubWelcome {
  /** Your bean's id. */
  you: string;
  /** The hub layout's name (`HUB_LAYOUTS`). */
  layout: string;
  roster: RosterEntry[];
}
