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
be short, so newlines and extra whitespace will be collapsed into a single space.
 
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

Multi-speaker quotes are a little trickier, but still pretty straightforward.
Such quotes are made up of one or more *lines* plus a bit of contextual
information.

A *line* consists of two parts: the *speaker* and the *content*. Like writing
a screenplay, the format is `speaker: content`. It is optional to put quotes
around the content (unless the line appears in the task name, see below).
Quotes are supposed to be short, so newlines and extra whitespace will be
collapsed into a single space.

Quotana interprets a multi-speaker quote the following way:

**Lines:** Will read them from either the task name *or* the description,
whichever appears to contain them. If the name consist of lines then the
description will be interpreted as the *context*. If the description consists
of lines then the name will be ignored and serves just to label the quote
in Asana somehow.

**Context:** Multi-speaker quotes have a *context*, or explanation
of what was going on at the time. For proper display, this is usually written
as if completing the sentence "This was said _____". If the quote lines are in
the task name, then the description is used as context. Conversely if the lines
are in the description, then the task name is the context.

**Date:** The creation date of the task will be used as the date of the quote,
unless a date line is the last line of the task description. A date line is
always of the form `YYYY-MM-DD` to indicate the date, e.g. `2015-02-23`.
With some work the system could be more flexible in interpreting dates but
for now this is the only way it will figure it out correctly.

#### Example 1

Single speaker, context in name, dated as of task creation.

**Name:** `about aors`

**Description:**

    phips: "One night I taught Hannah about AoRs and all of the sudden I
    had the laundry AoR and the dirty dishes AoR"
    

#### Example 2

Two speakers, context in name, explicitly dated.

**Name:** `on slack`
    
**Description:**

    sri: I am going to be oncall for Valentine's day 
    bella: Don't break hearts!
    2015-01-07

#### Example 3

One speaker, lines in name, no context

**Name:** `manoj: "So, horse masks, yea or neigh?"`
    
**Description:**

    (empty)

#### Example 4

One speaker, lines in name, context in description, explicitly dated

**Name:** `bella: "In Russian we have a saying: 'Thank you is too much, but three dollars will do just fine.'"`
    
**Description:**

    on whether peer recognition should be monetary
    2015-02-12

#### Example 5

Two speakers, lines in name, no context

**Name:** `Vanessa: "[to stephanie] Do you usually intervene in other people's conversations?" Marcos: "I do."`
    
**Description:**

    (empty)


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
    
