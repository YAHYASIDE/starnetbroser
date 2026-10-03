#!/usr/bin/env bash
# Runs the JUnit tests of pure-Java classes in the local-browser plugin without the Android SDK.
# Usage: junit.sh SettleTracker [SyncPacing ...]   (each needs <Name>.java and <Name>Test.java,
# and must not import android.*).
set -euo pipefail
root="$(git rev-parse --show-toplevel)/packages/local-browser-plugin/android/src"
pkg="com/starnetbroser/localbrowser"
lib="$(ls -d /opt/gradle-*/lib 2>/dev/null | head -1)"
junit="$(ls "$lib"/junit-4*.jar | head -1)"; hamcrest="$(ls "$lib"/hamcrest-core-*.jar | head -1)"
out="$(mktemp -d)"
files=(); tests=()
for name in "$@"; do
  files+=("$root/main/java/$pkg/$name.java" "$root/test/java/$pkg/${name}Test.java")
  tests+=("com.starnetbroser.localbrowser.${name}Test")
done
javac -d "$out" -cp "$junit" "${files[@]}" 2>&1 | grep -v JAVA_TOOL_OPTIONS || true
java -cp "$out:$junit:$hamcrest" org.junit.runner.JUnitCore "${tests[@]}" 2>&1 | grep -v JAVA_TOOL_OPTIONS | tail -5
