#!/bin/bash
# AGPLv3.0
# Adapted from https://github.com/stashapp/plugins-repo-template/blob/main/build_site.sh

# builds a repository of plugins
# outputs to _site with the following structure:
# index.yml
# <plugin_id>.zip
# Each zip file contains the plugin.yml file and any other files in the same directory
set -euo pipefail

outdir="$1"
if [ -z "$outdir" ]; then
    outdir="_site"
fi

rm -rf "$outdir"
mkdir -p "$outdir"

buildPlugin()
{
    f=$1
    # get the plugin id from the directory
    dir=$(dirname "$f")
    plugin_id=$(basename "$f" .yml)

    echo "Processing $plugin_id"

    # Upstream computes version/date from `git log` on $dir (the plugin's
    # own directory under plugins/). That only works if plugins/ is
    # committed -- this repo deliberately assembles plugins/<id>/ fresh from
    # <id>/dist/ on every run and never commits it (see root README), so it
    # has no real git history of its own. Read history from the actual
    # SOURCE directory instead -- by this repo's convention, that's a
    # top-level directory with the same name as the plugin id (e.g.
    # librarian/ for plugin_id "librarian").
    srcdir="./$plugin_id"
    version=$(git log -n 1 --pretty=format:%h -- "$srcdir"/* 2>/dev/null)
    updated=$(TZ=UTC0 git log -n 1 --date="format-local:%F %T" --pretty=format:%ad -- "$srcdir"/* 2>/dev/null)

    # create the zip file
    # copy other files
    zipfile=$(realpath "$outdir/$plugin_id.zip")

    pushd "$dir" > /dev/null
    zip -r "$zipfile" . > /dev/null
    popd > /dev/null

    name=$(grep "^name:" "$f" | head -n 1 | cut -d' ' -f2- | sed -e 's/\r//' -e 's/^"\(.*\)"$/\1/')
    description=$(grep "^description:" "$f" | head -n 1 | cut -d' ' -f2- | sed -e 's/\r//' -e 's/^"\(.*\)"$/\1/')
    ymlVersion=$(grep "^version:" "$f" | head -n 1 | cut -d' ' -f2- | sed -e 's/\r//' -e 's/^"\(.*\)"$/\1/')
    version="$ymlVersion-$version"
    IFS=$'\n' dep=$(grep "^# requires:" "$f" | cut -c 12- | sed -e 's/\r//')

    # write to spec index
    echo "- id: $plugin_id
  name: $name
  metadata:
    description: $description
  version: $version
  date: $updated
  path: $plugin_id.zip
  sha256: $(sha256sum "$zipfile" | cut -d' ' -f1)" >> "$outdir"/index.yml

    # handle dependencies
    if [ ! -z "$dep" ]; then
        echo "  requires:" >> "$outdir"/index.yml
        for d in ${dep//,/ }; do
            echo "    - $d" >> "$outdir"/index.yml
        done
    fi

    echo "" >> "$outdir"/index.yml
}

find ./plugins -mindepth 1 -name "*.yml" | while read -r file; do
    buildPlugin "$file"
done
