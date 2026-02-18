use aws_lambda_events::event::cognito::*;
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use serde_json::{from_value, json, to_value, Value};

///
/// All possible Cognito User Pool Lifecycle events
///
#[derive(Debug, Clone, PartialEq)]
pub enum CognitoUserPoolEvent {
    PreSignup(CognitoEventUserPoolsPreSignup),
    PreAuthentication(CognitoEventUserPoolsPreAuthentication),
    PostConfirmation(CognitoEventUserPoolsPostConfirmation),
    PreTokenGen(CognitoEventUserPoolsPreTokenGen),
    PreTokenGenV2(CognitoEventUserPoolsPreTokenGenV2),
    PostAuthentication(CognitoEventUserPoolsPostAuthentication),
    MigrateUser(CognitoEventUserPoolsMigrateUser),
    ChallengeResult(CognitoEventUserPoolsChallengeResult),
    DefineAuthChallenge(CognitoEventUserPoolsDefineAuthChallenge),
    CreateAuthChallenge(CognitoEventUserPoolsCreateAuthChallenge),
    VerifyAuthChallenge(CognitoEventUserPoolsVerifyAuthChallenge),
    CustomMessage(CognitoEventUserPoolsCustomMessage),
    Unknown(Value),
}

impl<'de> Deserialize<'de> for CognitoUserPoolEvent {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let v: Value = Value::deserialize(deserializer)?;

        // extract triggerSource
        let trigger_source = v
            .get("triggerSource")
            .and_then(|t| t.as_str())
            .unwrap_or_default();

        let result = match trigger_source {
            ts if ts.starts_with("PreSignUp_") => {
                from_value::<CognitoEventUserPoolsPreSignup>(v).map(CognitoUserPoolEvent::PreSignup)
            }
            "PreAuthentication_Authentication" => {
                from_value::<CognitoEventUserPoolsPreAuthentication>(v)
                    .map(CognitoUserPoolEvent::PreAuthentication)
            }
            ts if ts.starts_with("PostConfirmation_") => {
                from_value::<CognitoEventUserPoolsPostConfirmation>(v)
                    .map(CognitoUserPoolEvent::PostConfirmation)
            }
            "PreTokenGeneration_Authentication" => {
                // Try V2 first, fallback to V1
                if let Ok(ev) = from_value::<CognitoEventUserPoolsPreTokenGenV2>(v.clone()) {
                    Ok(CognitoUserPoolEvent::PreTokenGenV2(ev))
                } else {
                    from_value::<CognitoEventUserPoolsPreTokenGen>(v)
                        .map(CognitoUserPoolEvent::PreTokenGen)
                }
            }
            "PostAuthentication_Authentication" => {
                from_value::<CognitoEventUserPoolsPostAuthentication>(v)
                    .map(CognitoUserPoolEvent::PostAuthentication)
            }
            "MigrateUser_Authentication" => from_value::<CognitoEventUserPoolsMigrateUser>(v)
                .map(CognitoUserPoolEvent::MigrateUser),
            "DefineAuthChallenge_Authentication" => {
                from_value::<CognitoEventUserPoolsDefineAuthChallenge>(v)
                    .map(CognitoUserPoolEvent::DefineAuthChallenge)
            }
            "CreateAuthChallenge_Authentication" => {
                from_value::<CognitoEventUserPoolsCreateAuthChallenge>(v)
                    .map(CognitoUserPoolEvent::CreateAuthChallenge)
            }
            "VerifyAuthChallengeResponse_Authentication" => {
                from_value::<CognitoEventUserPoolsVerifyAuthChallenge>(v)
                    .map(CognitoUserPoolEvent::VerifyAuthChallenge)
            }
            "Authentication_ChallengeResult" => {
                from_value::<CognitoEventUserPoolsChallengeResult>(v)
                    .map(CognitoUserPoolEvent::ChallengeResult)
            }
            ts if ts.starts_with("CustomMessage_") => {
                from_value::<CognitoEventUserPoolsCustomMessage>(v)
                    .map(CognitoUserPoolEvent::CustomMessage)
            }
            _ => Ok(CognitoUserPoolEvent::Unknown(v)),
        };

        result.map_err(serde::de::Error::custom)
    }
}

impl Serialize for CognitoUserPoolEvent {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let v: Value = match self {
            CognitoUserPoolEvent::PreSignup(t) => to_value(t).unwrap_or(json!({})),
            CognitoUserPoolEvent::PreAuthentication(t) => to_value(t).unwrap_or(json!({})),
            CognitoUserPoolEvent::PostConfirmation(t) => to_value(t).unwrap_or(json!({})),
            CognitoUserPoolEvent::PreTokenGen(t) => to_value(t).unwrap_or(json!({})),
            CognitoUserPoolEvent::PreTokenGenV2(t) => to_value(t).unwrap_or(json!({})),
            CognitoUserPoolEvent::PostAuthentication(t) => to_value(t).unwrap_or(json!({})),
            CognitoUserPoolEvent::MigrateUser(t) => to_value(t).unwrap_or(json!({})),
            CognitoUserPoolEvent::ChallengeResult(t) => to_value(t).unwrap_or(json!({})),
            CognitoUserPoolEvent::DefineAuthChallenge(t) => to_value(t).unwrap_or(json!({})),
            CognitoUserPoolEvent::CreateAuthChallenge(t) => to_value(t).unwrap_or(json!({})),
            CognitoUserPoolEvent::VerifyAuthChallenge(t) => to_value(t).unwrap_or(json!({})),
            CognitoUserPoolEvent::CustomMessage(t) => to_value(t).unwrap_or(json!({})),
            CognitoUserPoolEvent::Unknown(v) => v.clone(),
        };
        v.serialize(serializer)
    }
}
