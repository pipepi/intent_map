# PIP Repository

This directory contains authoritative PIP files maintained by this source repository.
It contains no registry or loading mechanism: build and promotion scripts write these
files, while `../runtime/` discovers and loads them.

`system/` is organized by PIP layer and package identity.
