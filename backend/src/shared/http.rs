use lambda_http::http::{header::CONTENT_TYPE, StatusCode};
use lambda_http::{Body, Error, Response};
use serde::Serialize;

/// Creates a JSON HTTP response with status code 200 OK and matching Content-Type.
pub fn json_response<T>(value: T) -> Result<Response<Body>, Error>
where
    T: Serialize,
{
    json_with_status(value, StatusCode::OK)
}

/// Creates a JSON HTTP response with chosen status code and matching Content-Type.
pub fn json_with_status<T>(value: T, status: StatusCode) -> Result<Response<Body>, Error>
where
    T: Serialize,
{
    let body = serde_json::to_vec(&value)?;
    Response::builder()
        .status(status)
        .header(CONTENT_TYPE, "application/json")
        .body(Body::from(body))
        .map_err(Into::into)
}

#[cfg(test)]
mod tests {
    use super::json_response;
    use lambda_http::http::{header::CONTENT_TYPE, StatusCode};
    use lambda_http::{Body, Response};
    use serde::{Deserialize, Serialize};

    #[derive(Debug, Serialize, Deserialize, PartialEq)]
    struct Foo {
        bar: usize,
    }

    fn sample() -> Foo {
        Foo { bar: 8 }
    }

    fn body_bytes(resp: &Response<Body>) -> Vec<u8> {
        match resp.body() {
            Body::Empty => Vec::new(),
            Body::Text(s) => s.as_bytes().to_vec(),
            Body::Binary(b) => b.clone(),
            _ => panic!("Unexpected body variant"),
        }
    }

    #[test]
    fn json_response_plain_value_ok() {
        let resp = json_response(sample()).expect("response should be Ok");
        assert_eq!(resp.status(), StatusCode::OK);

        let ct = resp.headers().get(CONTENT_TYPE).unwrap();
        assert_eq!(ct, "application/json");

        let got: Foo = serde_json::from_slice(&body_bytes(&resp)).unwrap();
        assert_eq!(got, sample());
    }
}
