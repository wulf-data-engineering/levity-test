use tonic::{transport::Server, Request, Response, Status};
use protocol_macro::protocols;
use tower_http::cors::{Any, CorsLayer};
use tonic_web::GrpcWebLayer;

#[protocols("user_profile")]
pub mod user_profile_proto {}

use user_profile_service_server::{UserProfileService, UserProfileServiceServer};

#[derive(Debug, Default)]
pub struct MyUserProfileService {}

#[tonic::async_trait]
impl UserProfileService for MyUserProfileService {
    async fn get_profile(
        &self,
        request: Request<GetProfileRequest>,
    ) -> Result<Response<UserProfile>, Status> {
        let req = request.into_inner();
        println!("Got a request for user_id: {}", req.user_id);

        let reply = UserProfile {
            first_name: format!("User-{}", req.user_id),
            last_name: "From-ECS".to_string(),
        };

        Ok(Response::new(reply))
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let addr = "0.0.0.0:50051".parse()?;
    let user_profile_service = MyUserProfileService::default();

    println!("Server listening on {}", addr);

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    Server::builder()
        .accept_http1(true)
        .layer(cors)
        .layer(GrpcWebLayer::new())
        .add_service(UserProfileServiceServer::new(user_profile_service))
        .serve(addr)
        .await?;

    Ok(())
}
