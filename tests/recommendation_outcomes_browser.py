"""Actual shipped JS with controlled API/media/diagnostic transport, no live cohort."""
import copy
import json
import shutil
import socket
import struct
import subprocess
import sys
import time
from pathlib import Path
from urllib.request import urlopen
from urllib.error import HTTPError
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
FIX = ROOT / 'tests/fixtures/public-ux'
OUT = Path(sys.argv[1])
OUT.mkdir(parents=True, exist_ok=True)
with socket.socket() as socket_probe:
    socket_probe.bind(('127.0.0.1', 0))
    port = socket_probe.getsockname()[1]
base = f'http://127.0.0.1:{port}'
proc = subprocess.Popen(['node', 'scripts/preview-landing.mjs', str(port)], cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
report = {'synthetic': True, 'liveProviderCalls': False, 'diagnosticTransport': 'captured test SDK', 'widths': []}
recommendation = json.loads((FIX / 'recommendation.json').read_text())
recommendation['ranking_mode'] = 'retrieval_fallback'
recommendation['degraded'] = True
backup = {**recommendation['candidates'][0], 'id': 'waiting-skeleton', 'rank': 2, 'name': 'Synthetic backup'}
recommendation['candidates'].append(backup)
try:
    for _ in range(100):
        try:
            urlopen(base).close()
            break
        except Exception:
            time.sleep(.1)
    with sync_playwright() as playwright:
        executable = shutil.which('google-chrome') or shutil.which('chromium')
        mac_chrome = Path('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
        if not executable and mac_chrome.exists():
            executable = str(mac_chrome)
        browser = playwright.chromium.launch(**({'executable_path': executable} if executable else {}))
        for width in [390, 768, 1440]:
            context = browser.new_context(viewport={'width': width, 'height': 1000}, reduced_motion='reduce')
            page = context.new_page()
            errors, posted = [], []
            mode = {'feedback': 'error', 'recommend': 'success'}
            page.on('pageerror', lambda error: errors.append(str(error)))
            def route(request_route):
                request = request_route.request
                if not request.url.startswith(base):
                    if request.resource_type == 'image':
                        request_route.fulfill(body=(FIX / 'sample.png').read_bytes(), content_type='image/png')
                    else:
                        request_route.abort()
                    return
                path = request.url.removeprefix(base).split('?')[0]
                if path == '/app-health-log.js':
                    request_route.fulfill(body='window.__outcomes=[];window.appHealthLog=(event,body)=>window.__outcomes.push({event,...body});', content_type='text/javascript')
                    return
                if path.startswith('/api/'):
                    if path.startswith('/api/create/media/'):
                        request_route.fulfill(body=(FIX / 'sample.png').read_bytes(), content_type='image/png')
                        return
                    posted.append({'path': path, 'traffic': request.headers.get('x-fleet-traffic')})
                    if path == '/api/recommend':
                        if mode['recommend'] == 'error':
                            request_route.fulfill(status=503, json={'error': 'Controlled recommendation failure'})
                        elif mode['recommend'] == 'none':
                            request_route.fulfill(json={**recommendation, 'request_id': '22222222-2222-4222-8222-222222222222', 'decision': 'none', 'candidates': [], 'none_reason': 'A sincere answer belongs here.'})
                        else:
                            request_route.fulfill(json=copy.deepcopy(recommendation))
                    elif path == '/api/create':
                        request_route.fulfill(json=json.loads((FIX / 'composition.json').read_text()))
                    elif path == '/api/feedback':
                        if mode['feedback'] == 'error':
                            request_route.fulfill(status=503, json={'error': 'Controlled feedback failure'})
                        else:
                            request_route.fulfill(json={'saved': True, 'verdict': 'landed'})
                    else:
                        raise AssertionError('Unexpected API path')
                    return
                try:
                    response = urlopen(request.url, timeout=10)
                except HTTPError as response_error:
                    response = response_error
                with response:
                    request_route.fulfill(status=response.status, headers=dict(response.headers), body=response.read())
            page.route('**/*', route)
            page.goto(base + '/?fleet_qa=1')
            page.locator('#comment').fill('PRIVATE_COMMENT_SENTINEL')
            page.locator('#submit').click()
            page.locator('.studio-text').wait_for()
            initial = page.evaluate('window.__outcomes')
            assert len([event for event in initial if event['event'] == 'recommendation.shown']) == 1
            assert not any(event['event'] == 'recommendation.candidate_selected' for event in initial)
            page.locator('.create-alternative').click()
            expect(page.locator('#best-result h2')).to_have_text('Synthetic backup')
            page.locator('.studio-text').fill('PRIVATE_CAPTION_SENTINEL')
            with page.expect_download() as download:
                page.locator('[data-action="download"]').click()
            exported = OUT / f'export-{width}.png'
            download.value.save_as(exported)
            header = exported.read_bytes()[:24]
            assert header[:8] == b'\x89PNG\r\n\x1a\n'
            dimensions = struct.unpack('>II', header[16:24])
            assert all(value > 0 for value in dimensions)
            page.locator('[data-verdict="landed"]').click()
            expect(page.locator('#feedback-status')).to_have_text('Controlled feedback failure')
            assert not any(event['event'] == 'recommendation.feedback_saved' for event in page.evaluate('window.__outcomes'))
            mode['feedback'] = 'success'
            page.locator('[data-verdict="landed"]').click()
            expect(page.locator('#feedback-status')).to_have_text('Saved. Thank you.')
            page.evaluate('() => { window.__originalToBlob=HTMLCanvasElement.prototype.toBlob;HTMLCanvasElement.prototype.toBlob=function(callback){callback(null)}; }')
            page.locator('[data-action="download"]').click()
            expect(page.locator('.studio-status')).to_contain_text('Could not export this image')
            page.evaluate('() => { HTMLCanvasElement.prototype.toBlob=window.__originalToBlob; }')
            events = page.evaluate('window.__outcomes')
            for event_name in ['candidate_selected', 'download_requested', 'feedback_saved', 'export_failed']:
                matching = [event for event in events if event['event'] == 'recommendation.' + event_name]
                assert len(matching) == 1
                assert matching[0]['props']['candidate_rank'] == 2
                assert matching[0]['props']['recommendation_id'] == recommendation['request_id']
            assert all(event['props'].get('traffic_class') == 'qa' for event in events)
            assert not any('PRIVATE_' in json.dumps(event) for event in events)
            assert all(request['traffic'] == 'qa' for request in posted if request['path'] in ['/api/recommend', '/api/feedback'])
            assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
            page.screenshot(path=str(OUT / f'outcomes-{width}.png'), full_page=True)
            page.locator('#try-again').click()
            mode['recommend'] = 'none'
            page.locator('#submit').click()
            page.locator('#no-match').wait_for(state='visible')
            events = page.evaluate('window.__outcomes')
            none_events = [event for event in events if event['event'] == 'recommendation.shown' and event['props']['decision'] == 'none']
            assert len(none_events) == 1 and none_events[0]['props']['candidate_count'] == 0
            page.locator('#edit-comment').click()
            mode['recommend'] = 'error'
            page.locator('#submit').click()
            expect(page.locator('#status')).to_have_text('Controlled recommendation failure')
            events = page.evaluate('window.__outcomes')
            failed = [event for event in events if event['event'] == 'recommendation.failed']
            assert len(failed) == 1 and failed[0]['props']['traffic_class'] == 'qa'
            assert 'recommendation_id' not in failed[0]['props']
            assert not any('PRIVATE_' in json.dumps(event) for event in events)
            assert not errors, errors
            report['widths'].append({'width': width, 'events': events, 'pngDimensions': dimensions, 'pageErrors': errors, 'overflow': False})
            context.close()
        browser.close()
    (OUT / 'browser-readback.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'widths': [entry['width'] for entry in report['widths']], 'passed': True, 'synthetic': True, 'liveProviderCalls': False}))
finally:
    proc.terminate()
    proc.wait(timeout=10)
