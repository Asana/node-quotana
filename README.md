# Quotana

Uses Asana as a repository for capturing quotes of various types.

## Setting up

  1. Make a Quotana app
  2. Make a configuration file
  3. Put the secret in the environment (or config file)
  4. Run listener, it will output a refresh token
  5. Put the refresh token in the environment (or config file)

### Config file

TBD

## Quoticorn

The **Quoticorn** account will examine each quote added. He will also re-examine quotes after they change. If a quote is being changed, he will wait some amount of time for you to stop changing it, and which point he'll assume you're done and examine it. If you want him to examine it right away, you can assign the quote to him.

## Quote Format

Quotes come in two flavors: "simple" quotes which have only a single speaker,
and "multi-speaker" quotes which may have more than one participant. Each
project containing quotes interprets *all* of its quotes as a specific type.

### Simple Quotes

Simple quotes have a simple structure. Here's where each bit of information
should go.

**Speaker:** The full name of the task is used as the name of the speaker.

**Content:** The full content of the task description is used as the content
of the quote, unless it has a date line at the bottom. Quotes are supposed to
be short, so pare it down to just the essential part. Newlines and extra whitespace
will be collapsed into a single space.
 
**Date:** The creation date of the task will be used as the date of the quote,
unless a date line is the last line of the task description. A date line is
always of the form `YYYY-MM-DD` to indicate the date, e.g. `2015-02-23`.
With some work the system could be more flexible in interpreting dates but
for now this is the only way it will figure it out correctly.

#### Example 1

**Name:** `Nina Tomaro`

**Description:**

    If I have to recommend one app that has helped me become more productive
    and stay organized it is Asana.

#### Example 2

**Name:** `unknown`
    
**Description:**

    Asana rocks my world! Super user friendly, anyone can learn the
    platform easily as it's pretty intuitive. Great work!
    2015-01-01

### Multi-Speaker Quotes

Multi-speaker quotes are made up of one or more *lines* plus a bit of contextual
information. A line consists of two parts: the *speaker* and the *content*. Like writing
a screenplay, the format is `speaker: content`. It is optional to put quotes
around the content (unless the line appears in the task name, see below).

Tips:
  * Keep the quotes short! More than a few hundreds characters and it won't fit on the dashboard and no one will be able to read it. Pare it down to just what's essential (while retaining the impact or humor).
  * Like a screenplay, put one speaking line per line in the notes, e.g. `greg: hello!`. Don't separate the speaker and their line with newlines.
  * If the date is different than the date you created it, add it at the end on its own line in the format `YYYY-MM-DD`.
  * If you have actions in the speaking lines, put them as part of the spoken content, *not* the speaker name, e.g. `greg: "[surprised] huh?"` instead of `greg [surprised]: "huh?"`.
  * If you want to add some color/context, fit it on a single line on its own. If it's long, put it after a line of just `---` so Quotana will ignore it but it can stay in the task.
  * Quotes are supposed to be **short**! Or else it's not a quote, it's a story and it belongs somewhere else. Prefer usernames instead of full names. Newlines and extra whitespace will be collapsed into a single space.
  * Yes, the rules are a bit annoying and when Asana has a great custom schema these won't be necessary. But it's not that hard once you get the hang of it, so .. enjoy!

#### Example 1

Single speaker in notes, dated as of task creation.

**Name:** `phips on aors`

**Description:**

    phips: "One night I taught Hannah about AoRs and all of the sudden I
    had the laundry AoR and the dirty dishes AoR"
    

#### Example 2

Two speakers in notes, explicitly dated.

**Name:** `sri and bella on v-day`
    
**Description:**

    sri: I am going to be oncall for Valentine's day 
    bella: Don't break hearts!
    2015-01-07

#### Example 3

One speaker in name, no context

**Name:** `manoj: "So, horse masks, yea or neigh?"`
    
**Description:**

    (empty)

#### Example 4

One speaker in name with date, context in description

**Name:** `2015-02-12 bella: "In Russian we have a saying: 'Thank you is too much, but three dollars will do just fine.'"`
    
**Description:**

    on whether peer recognition should be monetary

#### Example 5

Two speakers in name, no context

**Name:** `Vanessa: "[to stephanie] Do you usually intervene in other people's conversations?" Marcos: "I do."`
    
**Description:**

    (empty)

#### Format Details

Quotana interprets a multi-speaker quote the following way:

**Lines:** Will read them from either the task name *or* the description,
whichever appears to contain them. If the name consist of lines then the
description will be interpreted as the *context*. If the description consists
of lines then the name will be ignored and serves just to identify the quote
in for Asana users.

**Date:** The creation date of the task will be used as the date of the quote,
unless the date is included on its own line in the task description OR at the
beginning of the name. A date line is always of the form `YYYY-MM-DD`, e.g.
`2015-02-23`. With some work the system
could be more flexible in interpreting dates but for now this is the only way
it will figure it out correctly.

**Context:** Multi-speaker quotes have a *context*, or explanation
of what was going on at the time. For proper display, this is usually written
as if completing the sentence "This was said _____". If the quote lines are in
the task name, then the description is used as context. Otherwise the context 
is whatever follows the lines of a quote and doesn't look like a speaker line
or date line.

**Extra Stuff:** Sometimes people like to add extra color to the quote,
maybe a lengthier context or description of something. This can't be
incorporated in a clean display in Quotana, but it can still be included in the
task as long as it follows a line containing multiple dashes (`---`). Everything
after that line will be ignored by the system.


## How It Works

Quotana is made up of two parts - a web server and a listener.

### Web Server

The web server presents a nice UI for rotating through quotes which may be
stored in various projects.

To run the server:

    gulp build-web
    PORT=5678 QUOTANA_CONFIG=/path/to/config.json node lib/web/server.js

### Listener

The listener loads quotes from their projects and listens to changes so it
can parse and validate them, ensuring they're in a format that the
web server can consume for display.

To run the listener:

    QUOTANA_CONFIG=/path/to/config.json gulp lib/listener/listener.js
    
