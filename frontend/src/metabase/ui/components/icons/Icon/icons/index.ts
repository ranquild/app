// Only the icons App uses. Add an icon by copying its SVG from metabase/ui and listing it here.

import add_component from "./add.svg?component";
import ai_component from "./ai.svg?component";
import arrow_left_component from "./arrow_left.svg?component";
import check_component from "./check.svg?component";
import check_filled_component from "./check_filled.svg?component";
import chevrondown_component from "./chevrondown.svg?component";
import chevronleft_component from "./chevronleft.svg?component";
import chevronright_component from "./chevronright.svg?component";
import chevronup_component from "./chevronup.svg?component";
import clock_component from "./clock.svg?component";
import close_component from "./close.svg?component";
import copy_component from "./copy.svg?component";
import data_studio_component from "./data_studio.svg?component";
import database_component from "./database.svg?component";
import ellipsis_component from "./ellipsis.svg?component";
import empty_component from "./empty.svg?component";
import exit_component from "./exit.svg?component";
import eye_component from "./eye.svg?component";
import eye_crossed_out_component from "./eye_crossed_out.svg?component";
import gear_component from "./gear.svg?component";
import git_branch_component from "./git_branch.svg?component";
import info_component from "./info.svg?component";
import info_outline_component from "./info_outline.svg?component";
import key_component from "./key.svg?component";
import layout_grid_component from "./layout_grid.svg?component";
import lock_component from "./lock.svg?component";
import mail_component from "./mail.svg?component";
import moon_component from "./moon.svg?component";
import pause_component from "./pause.svg?component";
import person_component from "./person.svg?component";
import play_component from "./play.svg?component";
import reference_component from "./reference.svg?component";
import refresh_component from "./refresh.svg?component";
import repository_component from "./repository.svg?component";
import search_component from "./search.svg?component";
import share_component from "./share.svg?component";
import sidebar_closed_component from "./sidebar_closed.svg?component";
import sidebar_open_component from "./sidebar_open.svg?component";
import stop_component from "./stop.svg?component";
import sun_component from "./sun.svg?component";
import trash_component from "./trash.svg?component";
import unknown_component from "./unknown.svg?component";
import warning_component from "./warning.svg?component";
import warning_round_filled_component from "./warning_round_filled.svg?component";

export const Icons = {
  add: add_component,
  ai: ai_component,
  arrow_left: arrow_left_component,
  check: check_component,
  check_filled: check_filled_component,
  chevrondown: chevrondown_component,
  chevronleft: chevronleft_component,
  chevronright: chevronright_component,
  chevronup: chevronup_component,
  clock: clock_component,
  close: close_component,
  copy: copy_component,
  data_studio: data_studio_component,
  database: database_component,
  ellipsis: ellipsis_component,
  empty: empty_component,
  exit: exit_component,
  external: share_component,
  eye: eye_component,
  eye_crossed_out: eye_crossed_out_component,
  gear: gear_component,
  git_branch: git_branch_component,
  info: info_component,
  info_outline: info_outline_component,
  key: key_component,
  layout_grid: layout_grid_component,
  lock: lock_component,
  mail: mail_component,
  moon: moon_component,
  pause: pause_component,
  person: person_component,
  play: play_component,
  reference: reference_component,
  refresh: refresh_component,
  repository: repository_component,
  search: search_component,
  share: share_component,
  sidebar_closed: sidebar_closed_component,
  sidebar_open: sidebar_open_component,
  stop: stop_component,
  sun: sun_component,
  trash: trash_component,
  unknown: unknown_component,
  warning: warning_component,
  warning_round_filled: warning_round_filled_component,
};

export type IconName = keyof typeof Icons;

export const iconNames = Object.keys(Icons) as IconName[];

export const isValidIconName = (name: unknown): name is IconName =>
  typeof name === "string" && name in Icons;
