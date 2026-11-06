VGM chip transmuter
===================

Copyright 2021 Laurens Holst

Project information
-------------------

  * Author: Laurens Holst <laurens@grauw.nl>
  * Source: <https://github.com/grauw/vgmtransmute>
  * License: Simplified BSD License

Converts music in VGM format from one to another chip.

Supported transmutations
------------------------

  * YM2608 OPNA -> YM2610B OPNB

Installation
------------

Node.js and NPM are required to be installed on the system. Then, install with:

    npm install -g

Alternatively it can be invoked without installation with `node cli.js`.

Usage instructions
------------------

    vgmtransmute CHIP input.vgm output.vgm

Target CHIPs:

  * ym2610b

Options:

  * `-sa` SSG attenuation in dB.

The source and target files can also be compressed vgz files.
