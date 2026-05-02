# Sui Private Threads - Smart Contracts

Move smart contracts for the Sui Private Threads application.

## Building

```bash
sui move build
```

## Testing

```bash
sui move test
```

## Publishing

```bash
# Publish to testnet
sui client publish --gas-budget 100000000

# Publish to mainnet (be careful!)
sui client publish --gas-budget 100000000 --network mainnet
```

After publishing, note the package ID and update it in the frontend `.env` file.

## Contract Overview

### Objects

- **UserProfile**: Stores user profile information (username, bio, follower counts)
- **EncryptedPost**: Stores post metadata including Walrus blob ID and SEAL-encrypted key
- **FollowerList**: Manages follower relationships for a user
- **AccessKey**: (Future) SEAL key references for decryption

### Entry Functions

- `create_profile`: Create a new user profile
- `create_post`: Create an encrypted post
- `init_follower_list`: Initialize follower list for a user
- `follow`: Follow a user
- `unfollow`: Unfollow a user

### Events

- `ProfileCreated`: Emitted when a profile is created
- `PostCreated`: Emitted when a post is created
- `FollowEvent`: Emitted when a user follows another
- `UnfollowEvent`: Emitted when a user unfollows another

