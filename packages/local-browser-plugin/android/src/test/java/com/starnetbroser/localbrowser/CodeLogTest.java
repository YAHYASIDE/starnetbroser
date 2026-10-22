package com.starnetbroser.localbrowser;

import static org.junit.Assert.assertEquals;

import java.util.List;
import org.junit.Test;

public class CodeLogTest {

    private static final long DAY = 24L * 60 * 60 * 1000;

    @Test
    public void keepsEachCodeWithItsDeviceAndKind() {
        String log = CodeLog.append("", 1000, "dev-1", "starlink", "123456", 1000);
        log = CodeLog.append(log, 2000, "dev-2", "mail", "9876", 2000);
        List<CodeLog.Entry> list = CodeLog.parse(log);
        assertEquals(2, list.size());
        assertEquals("dev-1", list.get(0).accountId);
        assertEquals("starlink", list.get(0).kind);
        assertEquals("9876", list.get(1).code);
    }

    @Test
    public void theSameCodeTwiceIsKeptOnceAtItsLatestTime() {
        String log = CodeLog.append("", 1000, "dev-1", "starlink", "123456", 1000);
        log = CodeLog.append(log, 5000, "dev-1", "starlink", "123456", 5000);
        List<CodeLog.Entry> list = CodeLog.parse(log);
        assertEquals(1, list.size());
        assertEquals(5000, list.get(0).at);
    }

    @Test
    public void dropsCodesOlderThan30DaysAndKeepsAtMost200() {
        String log = CodeLog.append("", 0, "old", "starlink", "111111", 0);
        log = CodeLog.append(log, 31 * DAY, "new", "starlink", "222222", 31 * DAY);
        assertEquals(1, CodeLog.parse(log).size());
        String many = "";
        for (int i = 0; i < 250; i++) many = CodeLog.append(many, i, "d" + i, "card", String.valueOf(100000 + i), 250);
        List<CodeLog.Entry> list = CodeLog.parse(many);
        assertEquals(CodeLog.MAX, list.size());
        assertEquals("100249", list.get(list.size() - 1).code);
    }

    @Test
    public void tabsAndNewlinesNeverBreakALineAndBrokenLinesAreSkipped() {
        String log = CodeLog.append("x\ty\n12\ta\tb", 7, "dev\t1", "starlink", " 4321\n", 7);
        List<CodeLog.Entry> list = CodeLog.parse(log);
        assertEquals(1, list.size());
        assertEquals("dev 1", list.get(0).accountId);
        assertEquals("4321", list.get(0).code);
    }
}
