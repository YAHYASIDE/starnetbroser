package com.starnet.browser.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val Colors = lightColorScheme(
    primary = Color(0xFF0D7B4A),
    onPrimary = Color.White,
    secondary = Color(0xFF3C6758),
    background = Color(0xFFF3F7F5),
    surface = Color.White,
    error = Color(0xFFB3261E)
)

@Composable
fun StarNetTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = Colors, content = content)
}
