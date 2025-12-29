#!/usr/bin/env python3
"""
Локальный сервер для OMI Chat v0.2
Запуск: python start-server.py
"""

import http.server
import socketserver
import webbrowser
import os
import sys
import time
from pathlib import Path
import threading

PORT = 8000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)
    
    def end_headers(self):
        # Добавляем CORS заголовки
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()
    
    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

def print_banner():
    print("""
╔══════════════════════════════════════════════════════════════╗
║                    OMI Chat v0.2 - Локальный                ║
║                     🚀 Запуск сервера                       ║
╚══════════════════════════════════════════════════════════════╝
    """)

def check_files():
    print("📁 Проверка файлов проекта...")
    required_files = [
        ('index.html', 'Главный HTML файл'),
        ('css/style.css', 'Стили приложения'),
        ('js/app.js', 'JavaScript логика')
    ]
    
    all_ok = True
    for file, description in required_files:
        path = Path(DIRECTORY) / file
        if path.exists():
            print(f"  ✅ {file} - {description}")
        else:
            print(f"  ❌ {file} - НЕ НАЙДЕН!")
            all_ok = False
    
    if not all_ok:
        print("\n⚠️  Некоторые файлы не найдены!")
        print("Убедитесь, что структура проекта правильная:")
        print("""
omichat-v0.2/
├── index.html
├── css/
│   └── style.css
├── js/
│   └── app.js
└── start-server.py
        """)
        return False
    
    print("\n✅ Все файлы найдены!")
    return True

def main():
    print_banner()
    
    if not check_files():
        print("\n❌ Не могу запустить сервер: отсутствуют файлы")
        input("\nНажмите Enter для выхода...")
        sys.exit(1)
    
    print(f"\n📂 Папка проекта: {DIRECTORY}")
    print(f"🌐 Сервер будет доступен по адресу: http://localhost:{PORT}")
    
    try:
        # Запускаем сервер в отдельном потоке
        with socketserver.TCPServer(("", PORT), Handler) as httpd:
            print("\n🔄 Запуск сервера...")
            
            # Открываем браузер через 1 секунду
            def open_browser():
                time.sleep(1)
                webbrowser.open(f'http://localhost:{PORT}')
            
            threading.Thread(target=open_browser, daemon=True).start()
            
            print(f"\n✅ Сервер запущен успешно!")
            print("🎉 OMI Chat v0.2 готов к использованию!")
            print("\n🎮 Управление:")
            print("  • Откройте браузер по ссылке выше")
            print("  • Ctrl+C — остановить сервер")
            print("  • F5 в браузере — обновить страницу")
            print("\n⚠️  Примечание:")
            print("  • Для работы API Google Sheets нужно настроить доступ")
            print("  • Локальный чат будет работать без сохранения в таблицу")
            print("\n" + "="*60)
            
            httpd.serve_forever()
            
    except OSError as e:
        if "Address already in use" in str(e):
            print(f"\n❌ Порт {PORT} уже используется!")
            print("Попробуйте другой порт или закройте другую программу")
        else:
            print(f"\n❌ Ошибка: {e}")
    except KeyboardInterrupt:
        print("\n\n👋 Останавливаю сервер...")
    except Exception as e:
        print(f"\n❌ Неизвестная ошибка: {e}")
    
    input("\nНажмите Enter для выхода...")

if __name__ == "__main__":
    main()