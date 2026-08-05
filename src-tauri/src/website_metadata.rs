use std::time::Duration;

use reqwest::{header::CONTENT_TYPE, redirect::Policy};
use scraper::{Html, Selector};
use url::Url;

const MAX_HTML_BYTES: usize = 512 * 1024;
const MAX_NAME_CHARS: usize = 200;

pub(crate) async fn fetch_website_name(value: &str) -> Result<String, String> {
    let url = validate_url(value)?;
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(4))
        .timeout(Duration::from_secs(8))
        .redirect(Policy::limited(3))
        .user_agent("WebPasswordManager/0.5 website-name-resolver")
        .build()
        .map_err(|_| "无法创建网站信息请求".to_string())?;

    let mut response = client
        .get(url.clone())
        .send()
        .await
        .map_err(|_| "无法连接该网站".to_string())?;

    if !response.status().is_success() {
        return Err(format!("网站返回了状态码 {}", response.status()));
    }

    let is_html = response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(|value| {
            let value = value.to_ascii_lowercase();
            value.starts_with("text/html") || value.starts_with("application/xhtml+xml")
        })
        .unwrap_or(true);
    if !is_html {
        return Err("该网址返回的不是网页".to_string());
    }

    if response
        .content_length()
        .is_some_and(|length| length > MAX_HTML_BYTES as u64)
    {
        return Err("网页内容过大，无法读取名称".to_string());
    }

    let mut body = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "读取网页内容失败".to_string())?
    {
        if body.len() + chunk.len() > MAX_HTML_BYTES {
            return Err("网页内容过大，无法读取名称".to_string());
        }
        body.extend_from_slice(&chunk);
    }

    let html = String::from_utf8_lossy(&body);
    extract_website_name(&html)
        .or_else(|| fallback_name(&url))
        .ok_or_else(|| "网页中没有可识别的网站名称".to_string())
}

fn validate_url(value: &str) -> Result<Url, String> {
    let url =
        Url::parse(value.trim()).map_err(|_| "请输入完整的 HTTP 或 HTTPS 网址".to_string())?;
    if !matches!(url.scheme(), "http" | "https") || url.host_str().is_none() {
        return Err("只支持 HTTP 或 HTTPS 网址".to_string());
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err("网址不能包含用户名或密码".to_string());
    }
    Ok(url)
}

fn extract_website_name(html: &str) -> Option<String> {
    let document = Html::parse_document(html);
    let selectors = [
        ("meta[property='og:site_name']", true),
        ("meta[name='application-name']", true),
        ("title", false),
    ];

    for (selector, is_meta) in selectors {
        let selector = Selector::parse(selector).expect("static selector is valid");
        if let Some(element) = document.select(&selector).next() {
            let raw = if is_meta {
                element
                    .value()
                    .attr("content")
                    .unwrap_or_default()
                    .to_string()
            } else {
                element.text().collect::<Vec<_>>().join(" ")
            };
            if let Some(name) = normalize_name(&raw) {
                return Some(name);
            }
        }
    }
    None
}

fn normalize_name(value: &str) -> Option<String> {
    let normalized = value.split_whitespace().collect::<Vec<_>>().join(" ");
    if normalized.is_empty() {
        return None;
    }
    Some(normalized.chars().take(MAX_NAME_CHARS).collect())
}

fn fallback_name(url: &Url) -> Option<String> {
    let host = url.host_str()?.trim_start_matches("www.");
    let label = host.split('.').next().unwrap_or(host);
    normalize_name(label)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prefers_open_graph_site_name() {
        let html = r#"<html><head><title>登录 - 示例</title><meta property="og:site_name" content="示例网站"></head></html>"#;
        assert_eq!(extract_website_name(html).as_deref(), Some("示例网站"));
    }

    #[test]
    fn falls_back_to_normalized_title() {
        let html = "<title>  示例\n  登录中心 </title>";
        assert_eq!(extract_website_name(html).as_deref(), Some("示例 登录中心"));
    }

    #[test]
    fn rejects_unsupported_or_credentialed_urls() {
        assert!(validate_url("file:///tmp/example").is_err());
        assert!(validate_url("https://user:secret@example.test").is_err());
    }
}
